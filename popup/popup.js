// ============================================================
// 左侧导航：标准 tab 模式（roving tabindex + 方向键 / Home / End）
// 另附两处与业务无关的 UI 辅助：
//   ① 滑块填充色（CSS 变量 --fill，未填充 #7A829E / 填充 #CBA6F7）
//   ② footer 保存按钮三态（未修改 / 已修改 / 已保存）与状态文案同步
// ============================================================
(function () {
  'use strict';

  var nav = document.querySelector('.nav');
  var tabs = [].slice.call(document.querySelectorAll('.nav-item'));
  var views = [].slice.call(document.querySelectorAll('.view'));

  var sliders = [].slice.call(document.querySelectorAll('.alpha-slider'));

  function fillSlider(s) {
    var min = parseFloat(s.min);
    var max = parseFloat(s.max);
    var v = parseFloat(s.value);
    if (isNaN(min)) min = 0;
    if (isNaN(max)) max = 1;
    if (isNaN(v)) v = min;
    var pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    s.style.setProperty('--fill', Math.max(0, Math.min(100, pct)) + '%');
  }

  function refreshSliderFills() {
    for (var i = 0; i < sliders.length; i++) fillSlider(sliders[i]);
  }

  function activate(tab, moveFocus) {
    var id = tab.getAttribute('data-view');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i] === tab;
      tabs[i].classList.toggle('active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
    }
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle('active', views[j].id === 'view-' + id);
    }
    if (moveFocus) tab.focus();
    // 面板代码会在切面板/加载时直接写 input.value，这里补一次填充色
    refreshSliderFills();
  }

  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () { activate(this, false); });
  }

  if (nav) {
    nav.addEventListener('keydown', function (e) {
      var idx = tabs.indexOf(document.activeElement);
      if (idx < 0) return;
      var next = -1;
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          next = (idx + 1) % tabs.length;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          next = (idx - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return; // Enter / Space 走 <button> 原生 click
      }
      e.preventDefault();
      activate(tabs[next], true);
    });
  }

  // ---- 滑块填充色：input 事件 + 定期补刷（面板异步写值时） ----
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('alpha-slider')) fillSlider(t);
  }, true);
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('alpha-slider')) fillSlider(t);
  }, true);

  function refreshAll() { refreshSliderFills(); }
  // 供面板脚本在程序化改值后补刷填充色
  window.__xsdoiRefreshSliders = refreshSliderFills;
  if (document.readyState === 'complete') refreshAll();
  else window.addEventListener('load', refreshAll);
  setTimeout(refreshAll, 200);
  setTimeout(refreshAll, 600);
  setTimeout(refreshAll, 1200);

  // ---- footer 保存按钮三态 + 左侧状态文案 ----
  function initSaveFooter(view) {
    var btn = view.querySelector('.view-footer .save-btn');
    if (!btn) return;
    var status = view.querySelector('.view-footer .footer-status');
    var text = status ? status.querySelector('.footer-text') : null;

    function setStatus(msg, cls) {
      if (text) text.textContent = msg;
      if (!status) return;
      status.classList.remove('is-dirty', 'is-ok', 'is-err');
      if (cls) status.classList.add(cls);
    }

    function sync() {
      if (btn.classList.contains('saved')) setStatus('已保存', 'is-ok');
      else if (btn.classList.contains('save-error')) setStatus('保存失败', 'is-err');
      else if (btn.classList.contains('dirty')) setStatus('有未保存的修改', 'is-dirty');
      else setStatus('未修改', '');
    }

    function markDirty() {
      if (btn.classList.contains('saved') || btn.classList.contains('save-error')) return;
      if (!btn.classList.contains('dirty')) btn.classList.add('dirty');
      sync();
    }

    // 捕获阶段先标脏，随后面板自己的 updateSaveState 再按真实差异纠正
    view.addEventListener('input', markDirty, true);
    view.addEventListener('change', markDirty, true);
    view.addEventListener('click', function (e) {
      var t = e.target;
      var seg = t && t.closest ? t.closest('.bg-fit, .bg-tab, .seg > button') : null;
      if (seg) markDirty();
    }, true);

    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(sync).observe(btn, {
        attributes: true,
        attributeFilter: ['class']
      });
    }
    sync();
  }

  for (var k = 0; k < views.length; k++) initSaveFooter(views[k]);
})();
