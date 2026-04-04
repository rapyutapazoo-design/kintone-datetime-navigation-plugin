(function(PLUGIN_ID) {
  'use strict';

  var $select = document.getElementById('target-field-select');
  var $cancel = document.getElementById('plugin-cancel');
  var $submit = document.getElementById('plugin-submit');

  var conf = kintone.plugin.app.getConfig(PLUGIN_ID);

  // 1. フォーム情報の取得（日時・日付フィールドの抽出）
  kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', {app: kintone.app.getId()}, function(resp) {
    var fields = resp.properties;
    for (var key in fields) {
      if (!fields.hasOwnProperty(key)) continue;
      var field = fields[key];
      
      // 日時(DATETIME)、日付(DATE)フィールドのみ対象にする
      if (field.type === 'DATETIME' || field.type === 'DATE') {
        var option = document.createElement('option');
        option.value = field.code;
        // 例: 「施設利用日時 (Datetime_12)」と表示する
        option.textContent = field.label + ' (' + field.code + ')';
        $select.appendChild(option);
      }
    }

    // 既に設定値が保存されていれば初期選択状態にする
    if (conf.targetFieldCode) {
      $select.value = conf.targetFieldCode;
    }
  });

  // 2. 保存ボタンのイベント
  $submit.addEventListener('click', function(e) {
    e.preventDefault();
    var val = $select.value;
    if (!val) {
      alert('基準とするフィールドを選択してください。');
      return;
    }
    // 設定を保存（kintoneに反映される）
    var newConf = {
      targetFieldCode: val
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
