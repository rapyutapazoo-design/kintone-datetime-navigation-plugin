(function() {
  'use strict';

  function escapeQueryValue(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function parseJsonArray(text) {
    if (Array.isArray(text)) return text;
    if (text === null || text === undefined || text === '') return [];
    try {
      var parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('日時基準ナビゲーション: 設定値のJSONを解釈できません。', e);
      }
      return [];
    }
  }

  function parseGroupsText(text) {
    var groups = [];
    var errors = [];
    var seen = {};
    var reported = {};
    var lines = String(text === null || text === undefined ? '' : text).split(/\r\n|\r|\n/);
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(/[,，、]/);
      var members = [];
      var inLine = {};
      for (var j = 0; j < parts.length; j++) {
        var name = parts[j].replace(/^\s+|\s+$/g, '');
        if (!name || inLine.hasOwnProperty(name)) continue;
        inLine[name] = true;
        members.push(name);
      }
      if (members.length < 2) continue;
      var gi = groups.length;
      for (var k = 0; k < members.length; k++) {
        var m = members[k];
        if (seen.hasOwnProperty(m) && seen[m] !== gi) {
          if (!reported.hasOwnProperty(m)) {
            reported[m] = true;
            errors.push('「' + m + '」が複数のグループに含まれています');
          }
        } else {
          seen[m] = gi;
        }
      }
      groups.push(members);
    }
    return { groups: groups, errors: errors };
  }

  function groupsToText(groups) {
    if (!Array.isArray(groups)) return '';
    var lines = [];
    for (var i = 0; i < groups.length; i++) {
      if (Array.isArray(groups[i])) lines.push(groups[i].join(','));
    }
    return lines.join('\n');
  }

  function getSameGroupMembers(name, groups) {
    if (!name || typeof name !== 'string') return [];
    if (Array.isArray(groups)) {
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        if (Array.isArray(g) && g.indexOf(name) !== -1) return g.slice();
      }
    }
    return [name];
  }

  function buildInCondition(fieldCode, values, negate) {
    if (!Array.isArray(values) || values.length === 0) return null;
    var escaped = [];
    for (var i = 0; i < values.length; i++) escaped.push(escapeQueryValue(values[i]));
    return fieldCode + (negate ? ' not in ' : ' in ') + '("' + escaped.join('", "') + '")';
  }

  function buildNavQuery(opts) {
    opts = opts || {};
    var id = Number(opts.currentId);
    if (opts.currentId === null || opts.currentId === undefined || opts.currentId === '' || !isFinite(id) || Math.floor(id) !== id) {
      return null;
    }
    var t = opts.targetFieldCode;
    var dt = escapeQueryValue(opts.currentDatetime);
    var op1 = opts.isNext ? '>' : '<';
    var op2 = opts.isNext ? 'asc' : 'desc';
    var core = '(' + t + ' ' + op1 + ' "' + dt + '") or (' + t + ' = "' + dt + '" and $id ' + op1 + ' ' + id + ')';
    var tail = ' order by ' + t + ' ' + op2 + ', $id ' + op2 + ' limit 1';
    var filters = [];
    if (Array.isArray(opts.filters)) {
      for (var i = 0; i < opts.filters.length; i++) {
        if (opts.filters[i]) filters.push(opts.filters[i]);
      }
    }
    if (filters.length === 0) return core + tail;
    var parts = [];
    for (var j = 0; j < filters.length; j++) parts.push('(' + filters[j] + ')');
    return parts.join(' and ') + ' and (' + core + ')' + tail;
  }

  // 絞り込み条件（同一施設・除外）を組み立てる
  function buildFilters(opts) {
    var filters = [];
    var scopeMembers = [];
    if (opts.sameFacilityOnly && opts.hasFacility && opts.currentFacility) {
      scopeMembers = getSameGroupMembers(opts.currentFacility, opts.facilityGroups);
      var facCond = buildInCondition(opts.facilityFieldCode, scopeMembers, false);
      if (facCond) filters.push(facCond);
    }
    var exValues = opts.excludeValues || [];
    if (opts.excludeFieldCode && exValues.length > 0) {
      if (!opts.record || !opts.record[opts.excludeFieldCode]) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('除外判定フィールド (' + opts.excludeFieldCode + ') が見つかりません。除外せずに検索します。');
        }
      } else {
        var exCond = buildInCondition(opts.excludeFieldCode, exValues, true);
        if (exCond) filters.push(exCond);
      }
    }
    return { filters: filters, scopeMembers: scopeMembers };
  }

  function buildNotFoundMessage(isNext, scopeMembers) {
    var word = isNext ? '新しい' : '古い';
    if (!Array.isArray(scopeMembers) || scopeMembers.length === 0) {
      return 'これ以上' + word + 'レコードはありません。';
    }
    return '同一施設（' + scopeMembers.join('・') + '）でこれ以上' + word + 'レコードはありません。';
  }

  function readToggle(storage, key, defaultValue) {
    try {
      if (!storage) return defaultValue;
      var v = storage.getItem(key);
      if (v === '1') return true;
      if (v === '0') return false;
      return defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  function writeToggle(storage, key, value) {
    try {
      if (!storage) return false;
      storage.setItem(key, value ? '1' : '0');
      return true;
    } catch (e) {
      return false;
    }
  }

  // PC 詳細画面の標準レコード移動矢印（∧∨）コンテナの探索候補（クラス名は非公開のため複数候補を順に試す）
  var ARROW_SELECTORS = [
    '.gaia-argoui-app-toolbar-pager',
    '.gaia-app-statusbar-recordnavi',
    '.gaia-argoui-record-navigation',
    '.gaia-app-statusbar [class*="pager"]',
    '.gaia-app-statusbar [class*="recordnavi"]',
    '.gaia-argoui-app-toolbar [class*="pager"]',
    '.gaia-argoui-app-toolbar [class*="recordnavi"]'
  ];

  // セレクタ候補を順に試し、最初に見つかった要素を返す（不正セレクタは無視、無ければ null）
  function findFirstMatch(root, selectors) {
    if (!root || typeof root.querySelector !== 'function' || !Array.isArray(selectors)) return null;
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = root.querySelector(selectors[i]);
        if (el) return el;
      } catch (e) {
        // 無効なセレクタは次の候補へ
      }
    }
    return null;
  }

  // wrapper が矢印の左隣（同じ段・重ならない）に収まっているか。rect は getBoundingClientRect 相当
  function isLeftOnSameRow(wrapperRect, arrowRect) {
    if (!wrapperRect || !arrowRect) return false;
    if (wrapperRect.width === 0 && wrapperRect.height === 0) return false;
    var sameRow = wrapperRect.top < arrowRect.bottom && wrapperRect.bottom > arrowRect.top;
    return sameRow && wrapperRect.right <= arrowRect.left + 1 && wrapperRect.left >= 0;
  }

  var api = {
    ARROW_SELECTORS: ARROW_SELECTORS,
    findFirstMatch: findFirstMatch,
    isLeftOnSameRow: isLeftOnSameRow,
    escapeQueryValue: escapeQueryValue,
    parseJsonArray: parseJsonArray,
    parseGroupsText: parseGroupsText,
    groupsToText: groupsToText,
    getSameGroupMembers: getSameGroupMembers,
    buildInCondition: buildInCondition,
    buildNavQuery: buildNavQuery,
    buildFilters: buildFilters,
    buildNotFoundMessage: buildNotFoundMessage,
    readToggle: readToggle,
    writeToggle: writeToggle
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    window.DatetimeNavCore = api;
  }
})();
