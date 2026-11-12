/* Isolated mobile drill-down controller for the existing R2-backed Explorer. */
(() => {
  'use strict';

  const mobile = window.matchMedia('(max-width: 700px), (orientation: landscape) and (max-height: 600px)');
  let stack = [];
  let vehicleId = null;
  let busy = false;

  const byId = id => document.getElementById(id);
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = value || '';
    if (className) node.className = className;
    return node;
  };

  function pageCount(node, seen = new Set()) {
    if (!node) return 0;
    let total = 0;
    if (node.pageId && !(node.children || []).length && !seen.has(String(node.pageId))) {
      seen.add(String(node.pageId));
      total++;
    }
    (node.children || []).forEach(child => { total += pageCount(child, seen); });
    return total;
  }

  function currentChildren() {
    const current = stack[stack.length - 1];
    return current?.node ? (current.node.children || []) : (liveManualTree || []);
  }

  function ensureChrome() {
    const panel = document.querySelector('.document-panel');
    if (!panel) return;
    let nav = byId('mobileDrillNav');
    if (!nav) {
      nav = document.createElement('section');
      nav.id = 'mobileDrillNav';
      nav.className = 'mobile-drill-nav';
      nav.setAttribute('aria-label', 'Factory contents navigation');
      nav.innerHTML = '<div class="mobile-drill-top"><button class="mobile-drill-back" type="button" aria-label="Back to previous level">‹ <span>Back</span></button><button class="mobile-drill-search" type="button" aria-label="Search factory procedures">⌕ <span>Search</span></button></div><nav class="mobile-drill-breadcrumbs" aria-label="Breadcrumb"></nav>';
      panel.insertBefore(nav, panel.firstChild);
      nav.querySelector('.mobile-drill-back').addEventListener('click', goBack);
      nav.querySelector('.mobile-drill-search').addEventListener('click', () => activateView('search'));
    }

    const toolbar = document.querySelector('.reader-toolbar');
    if (toolbar && !byId('mobileReaderBack')) {
      const button = document.createElement('button');
      button.id = 'mobileReaderBack';
      button.className = 'mobile-reader-back';
      button.type = 'button';
      button.textContent = '‹ Factory contents';
      button.addEventListener('click', goBackFromReader);
      toolbar.insertBefore(button, toolbar.firstChild);
    }
  }

  function syncHistoryRoot() {
    try {
      history.replaceState({ ...(history.state || {}), mepMobileNavigation: true, mepMobileDepth: 1 }, '');
    } catch { /* Navigation still works with the visible Back control. */ }
  }

  function reset(vehicle) {
    vehicleId = vehicle?.id || null;
    stack = [{ title: 'Factory Contents', node: null }];
    syncHistoryRoot();
    ensureChrome();
    render();
  }

  function renderBreadcrumbs() {
    const host = document.querySelector('.mobile-drill-breadcrumbs');
    if (!host) return;
    host.replaceChildren();
    stack.forEach((entry, index) => {
      if (index) host.append(text('span', '›', 'mobile-crumb-separator'));
      const crumb = document.createElement('button');
      crumb.type = 'button';
      crumb.className = 'mobile-crumb' + (index === stack.length - 1 ? ' current' : '');
      crumb.textContent = entry.title;
      crumb.setAttribute('aria-current', index === stack.length - 1 ? 'page' : 'false');
      crumb.addEventListener('click', () => navigateToDepth(index + 1));
      host.append(crumb);
    });
  }

  function render() {
    ensureChrome();
    const panel = document.querySelector('.document-panel');
    const list = byId('documentList');
    if (!panel || !list || !stack.length) return;
    if (!mobile.matches) return;

    const current = stack[stack.length - 1];
    const children = currentChildren();
    const back = panel.querySelector('.mobile-drill-back');
    if (back) back.disabled = stack.length <= 1 || busy;
    renderBreadcrumbs();

    byId('sectionTitle').textContent = current.title;
    byId('crumb').textContent = stack.map(item => item.title).join(' / ').toUpperCase();
    const pages = current.node ? collectPages(current.node) : collectPages({ children });
    liveManualGroups = [{ title: current.title, pages }];
    activeManualGroup = 0;
    if (typeof renderLivePagination === 'function') renderLivePagination();

    list.replaceChildren();
    if (busy) {
      list.append(text('p', 'Loading factory contents…', 'empty-state'));
      return;
    }
    if (!children.length) {
      list.append(text('p', current.node?.pageId ? 'Opening factory procedure…' : 'No entries are listed at this level.', 'empty-state'));
      return;
    }

    const fragment = document.createDocumentFragment();
    children.forEach(node => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'document-item mobile-drill-row';
      const icon = node.assetUrl
        ? Object.assign(document.createElement('img'), { className: 'toc-asset-icon', src: new URL(node.assetUrl, MANUAL_SITE).href, alt: '' })
        : iconNode(sectionIcon(node.title), 'doc-icon');
      const details = document.createElement('span');
      const label = text('b', node.title, 'mobile-drill-label');
      const isCategory = !!(node.children || []).length || !node.pageId;
      const subline = isCategory
        ? `${pageCount(node).toLocaleString()} ${pageCount(node) === 1 ? 'procedure' : 'procedures'}`
        : `Factory procedure · Page ${node.pageId}`;
      details.append(label, text('small', subline));
      button.append(icon, details);
      const count = pageCount(node);
      if (count) button.append(text('small', count.toLocaleString(), 'mobile-drill-count'));
      button.append(text('span', '›', 'doc-arrow'));
      button.addEventListener('click', () => openNode(node));
      fragment.append(button);
    });
    list.append(fragment);
    const footnote = document.querySelector('.list-footnote');
    if (footnote) footnote.textContent = `FACTORY CONTENTS · ${pages.length.toLocaleString()} PROCEDURES AT THIS LOCATION`;
  }

  function collectPages(node, out = [], seen = new Set()) {
    if (node?.pageId && !(node.children || []).length && !seen.has(String(node.pageId))) {
      seen.add(String(node.pageId));
      out.push({ pageId: String(node.pageId), title: node.title || `Manual page ${node.pageId}` });
    }
    (node?.children || []).forEach(child => collectPages(child, out, seen));
    return out;
  }

  function pushLevel(node) {
    stack.push({ title: node.title || 'Factory Contents', node });
    try {
      history.pushState({ mepMobileNavigation: true, mepMobileDepth: stack.length }, '');
    } catch { /* Visible breadcrumb and Back remain available. */ }
    render();
  }

  function navigateToDepth(depth) {
    if (depth < 1 || depth >= stack.length) return;
    const delta = depth - stack.length;
    try {
      if (history.state?.mepMobileNavigation) {
        history.go(delta);
        return;
      }
    } catch { /* Fall through to the local stack. */ }
    stack = stack.slice(0, depth);
    render();
  }

  function goBack() {
    if (stack.length <= 1) return;
    navigateToDepth(stack.length - 1);
  }

  function goBackFromReader() {
    if (history.state?.mepMobileNavigation && stack.length > 1) {
      history.back();
      return;
    }
    setMobileView('library', stack.at(-1)?.title || 'Factory Contents', 'Choose a factory section or procedure.');
    render();
  }

  async function resolveChildren(node) {
    if ((node.children || []).length || !node.pageId || !selectedVehicle) return node.children || [];
    const html = await fetchManualHtml(manualKey(selectedVehicle, `pages/${node.pageId}.html`));
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const children = buildHierarchicalToc(parsed).filter(child => String(child.pageId || '') !== String(node.pageId));
    if (children.length) node.children = children;
    return children;
  }

  async function openNode(node) {
    if (busy) return;
    busy = true;
    render();
    try {
      const children = await resolveChildren(node);
      busy = false;
      if (children.length) {
        pushLevel(node);
        setMobileView('library', node.title, 'Factory contents · choose the next level.');
        return;
      }
      if (node.pageId && selectedVehicle) {
        liveManualGroups = [{ title: stack.at(-1)?.title || 'Factory Contents', pages: collectPages(stack.at(-1)?.node || { children: liveManualTree }) }];
        activeManualGroup = 0;
        await showLiveManualPage(selectedVehicle, node.pageId, node.title);
        return;
      }
      render();
    } catch (error) {
      busy = false;
      if (node.pageId && selectedVehicle) {
        await showLiveManualPage(selectedVehicle, node.pageId, node.title);
      } else {
        document.getElementById('documentList')?.replaceChildren(text('p', `Unable to open this factory section. ${error.message}`, 'empty-state'));
      }
    }
  }

  const previousLoader = loadLiveManualIndex;
  loadLiveManualIndex = async function (vehicle) {
    await previousLoader(vehicle);
    reset(vehicle);
  };

  const previousOpenPage = showLiveManualPage;
  showLiveManualPage = async function (vehicle, pageId, title) {
    selectedVehicle = vehicle;
    return previousOpenPage(vehicle, pageId, title);
  };

  window.addEventListener('popstate', event => {
    const depth = event.state?.mepMobileDepth;
    if (event.state?.mepMobileNavigation && Number.isInteger(depth) && depth >= 1 && depth < stack.length) {
      stack = stack.slice(0, depth);
      busy = false;
      setMobileView('library', stack.at(-1)?.title || 'Factory Contents', 'Choose a factory section or procedure.');
      render();
    }
  });

  mobile.addEventListener?.('change', () => render());
})();
