(function(PLUGIN_ID) {
  'use strict';

  var Core = window.DatetimeNavCore;

  var $select = document.getElementById('target-field-select');
  var $facilitySelect = document.getElementById('facility-field-select');
  var $facilityOptions = document.getElementById('facility-options-list');
  var $groupsText = document.getElementById('facility-groups-text');
  var $excludeSelect = document.getElementById('exclude-field-select');
  var $excludeValuesText = document.getElementById('exclude-values-text');
  var $excludeOptionsWrapper = document.getElementById('exclude-options-wrapper');
  var $excludeOptions = document.getElementById('exclude-options-list');
  var $excludeStatusHint = document.getElementById('exclude-status-hint');
  var $cancel = document.getElementById('plugin-cancel');
  var $submit = document.getElementById('plugin-submit');

  var conf = kintone.plugin.app.getConfig(PLUGIN_ID);
  var props = null; // fields.json の properties（取得できなければ null）

  var addOption = function($el, field) {
    var option = document.createElement('option');
    option.value = field.code;
    // 例: 「施設利用日時 (Datetime_12)」と表示する
    option.textContent = field.label + ' (' + field.code + ')';
    $el.appendChild(option);
  };

  // 選択肢（options）を index 昇順の名前配列にする
  var getOptionNames = function(code) {
    if (!props || !code || !props[code] || !props[code].options) return null;
    var opts = props[code].options;
    var list = [];
    for (var k in opts) {
      if (!opts.hasOwnProperty(k)) continue;
      list.push({ name: opts[k].label || k, index: Number(opts[k].index) });
    }
    list.sort(function(a, b) { return a.index - b.index; });
    return list.map(function(o) { return o.name; });
  };

  var isChoiceType = function(code) {
    return !!(props && props[code] && (props[code].type === 'DROP_DOWN' || props[code].type === 'RADIO_BUTTON'));
  };

  var renderFacilityOptions = function() {
    var names = getOptionNames($facilitySelect.value);
    $facilityOptions.textContent = names ? names.join(' / ') : '（施設フィールドを選択すると表示されます）';
  };

  var renderExcludeOptions = function() {
    var code = $excludeSelect.value;
    var isStatus = !!(props && code && props[code] && props[code].type === 'STATUS');
    $excludeStatusHint.style.display = isStatus ? '' : 'none';
    if (isChoiceType(code)) {
      var names = getOptionNames(code);
      $excludeOptions.textContent = names ? names.join(' / ') : '';
      $excludeOptionsWrapper.style.display = '';
    } else {
      $excludeOptions.textContent = '';
      $excludeOptionsWrapper.style.display = 'none';
    }
  };

  // 保存済みのテキスト系設定を復元
  $groupsText.value = Core.groupsToText(Core.parseJsonArray(conf.facilityGroups).filter(function(g) {
    return Array.isArray(g);
  }));
  $excludeValuesText.value = Core.parseJsonArray(conf.excludeValues).join('\n');
  renderFacilityOptions();
  renderExcludeOptions();

  // 1. フォーム情報の取得（フィールド候補の抽出）
  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}, function(resp) {
    props = resp.properties;
    for (var key in props) {
      if (!props.hasOwnProperty(key)) continue;
      var field = props[key];

      // 基準: 日時(DATETIME)、日付(DATE)
      if (field.type === 'DATETIME' || field.type === 'DATE') {
        addOption($select, field);
      }
      // 施設: ドロップダウン / ラジオボタン
      if (field.type === 'DROP_DOWN' || field.type === 'RADIO_BUTTON') {
        addOption($facilitySelect, field);
      }
      // 除外判定: 有効なステータス、ドロップダウン / ラジオボタン
      if ((field.type === 'STATUS' && field.enabled === true) ||
          field.type === 'DROP_DOWN' || field.type === 'RADIO_BUTTON') {
        addOption($excludeSelect, field);
      }
    }

    // 既に設定値が保存されていれば初期選択状態にする
    if (conf.targetFieldCode) {
      $select.value = conf.targetFieldCode;
    }
    if (conf.facilityFieldCode) {
      $facilitySelect.value = conf.facilityFieldCode;
    }
    if (conf.excludeFieldCode) {
      $excludeSelect.value = conf.excludeFieldCode;
    }
    // 保存済みのフィールドがアプリから削除・変更されていれば警告する
    var missing = [];
    if (conf.targetFieldCode && $select.value !== conf.targetFieldCode) missing.push('基準フィールド (' + conf.targetFieldCode + ')');
    if (conf.facilityFieldCode && $facilitySelect.value !== conf.facilityFieldCode) missing.push('施設フィールド (' + conf.facilityFieldCode + ')');
    if (conf.excludeFieldCode && $excludeSelect.value !== conf.excludeFieldCode) missing.push('除外判定フィールド (' + conf.excludeFieldCode + ')');
    if (missing.length > 0) {
      alert('保存済みの次のフィールドがアプリに見つかりません。再選択して保存してください。\n' + missing.join('\n'));
    }
    renderFacilityOptions();
    renderExcludeOptions();
  });

  $facilitySelect.addEventListener('change', renderFacilityOptions);
  $excludeSelect.addEventListener('change', renderExcludeOptions);

  // 2. 保存ボタンのイベント
  $submit.addEventListener('click', function(e) {
    e.preventDefault();
    var val = $select.value;
    if (!val) {
      alert('基準とするフィールドを選択してください。');
      return;
    }

    // (1) 施設グループの書式検証
    var parsed = Core.parseGroupsText($groupsText.value);
    if (parsed.errors.length > 0) {
      alert('施設グループの設定に誤りがあります。\n' + parsed.errors.join('\n'));
      return;
    }

    // (1b) 未選択のまま値だけ入力されていないか
    if (!$facilitySelect.value && parsed.groups.length > 0) {
      alert('施設グループを入力するには、施設フィールドを選択してください。');
      return;
    }

    // (2) グループ内の施設名が施設フィールドの選択肢に存在するか
    var facilityCode = $facilitySelect.value;
    var facilityNames = getOptionNames(facilityCode);
    if (facilityCode && facilityNames) {
      for (var i = 0; i < parsed.groups.length; i++) {
        for (var j = 0; j < parsed.groups[i].length; j++) {
          if (facilityNames.indexOf(parsed.groups[i][j]) === -1) {
            alert('施設グループの「' + parsed.groups[i][j] + '」は施設フィールドの選択肢に存在しません。');
            return;
          }
        }
      }
    }

    // (3) 除外値の検証（ドロップダウン / ラジオボタンのみ。STATUS は検証しない）
    var excludeCode = $excludeSelect.value;
    var excludeValues = $excludeValuesText.value.split(/\r\n|\r|\n/).map(function(v) {
      return v.replace(/^\s+|\s+$/g, '');
    }).filter(function(v) { return v !== ''; });
    if (!excludeCode && excludeValues.length > 0) {
      alert('除外する値を入力するには、除外判定フィールドを選択してください。');
      return;
    }
    if (excludeCode && isChoiceType(excludeCode)) {
      var excludeNames = getOptionNames(excludeCode);
      if (excludeNames) {
        for (var k = 0; k < excludeValues.length; k++) {
          if (excludeNames.indexOf(excludeValues[k]) === -1) {
            alert('除外する値「' + excludeValues[k] + '」は除外判定フィールドの選択肢に存在しません。');
            return;
          }
        }
      }
    }

    // (4) 設定を保存（kintoneに反映される）
    var newConf = {
      targetFieldCode: val,
      facilityFieldCode: facilityCode || '',
      facilityGroups: JSON.stringify(parsed.groups),
      excludeFieldCode: excludeCode || '',
      excludeValues: JSON.stringify(excludeValues)
    };
    kintone.plugin.app.setConfig(newConf, function() {
      alert('設定を保存しました。アプリを更新してください。');
    });
  });

  // 3. キャンセルボタンのイベント
  $cancel.addEventListener('click', function(e) {
    e.preventDefault();
    history.back();
  });

})(kintone.$PLUGIN_ID);
