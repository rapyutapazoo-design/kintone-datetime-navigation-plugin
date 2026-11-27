(function(PLUGIN_ID) {
  'use strict';

  // 保存されている設定値の取得
  var conf = kintone.plugin.app.getConfig(PLUGIN_ID);
  var targetFieldCode = conf.targetFieldCode;

  var Core = window.DatetimeNavCore;
  if (!Core) {
    console.error('日時基準ナビゲーション: nav-core.js が読み込まれていません。');
    return;
  }

  // 絞り込み関連の設定（未設定なら従来動作）
  var facilityFieldCode = conf.facilityFieldCode || '';
  var facilityGroups = Core.parseJsonArray(conf.facilityGroups).filter(function(g) {
    return Array.isArray(g);
  });
  var excludeFieldCode = conf.excludeFieldCode || '';
  var excludeValues = Core.parseJsonArray(conf.excludeValues);

  var getAppId = function(isMobile) {
    return isMobile ? kintone.mobile.app.getId() : kintone.app.getId();
  };

  var getStorage = function() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  };

  if (!targetFieldCode) {
    console.error('日時基準ナビゲーション: 基準フィールドが設定されていません。プラグイン設定画面から保存してください。');
    return;
  }

  // レコード詳細画面の表示時イベント（PC版とモバイル版の両方に対応）
  kintone.events.on(['app.record.detail.show', 'mobile.app.record.detail.show'], function(event) {
    var record = event.record;
    var currentId = Number(record.$id.value);
    var isMobile = event.type === 'mobile.app.record.detail.show';

    // SPA 内でレコードが切り替わった場合に古い日時・施設のまま残らないよう、
    // 早期 return より前に既存コンテナとスワイプ用関数を破棄する
    var oldContainer = document.getElementById('custom-datetime-nav-container');
    if (oldContainer && oldContainer.parentNode) {
      oldContainer.parentNode.removeChild(oldContainer);
    }
    window._mobileSwipeNavigateRecord = null;
    
    // 対象フィールドがレコード内に存在するかチェック
    if (!record[targetFieldCode]) {
      console.warn('指定されたフィールド (' + targetFieldCode + ') が見つかりません。');
      return event;
    }
    
    // 現在のレコードの日付または日時データを取得
    var currentDatetime = record[targetFieldCode].value;
    if (!currentDatetime) return event; // 未登録の場合は何もしない

    // メニュー領域（ボタンを配置する場所）の取得
    var header;
    if (isMobile) {
      // モバイル版：標準のヘッダースペース
      header = kintone.mobile.app.record.getHeaderSpaceElement();
    } else {
      // PC版: プロセス管理のアクションボタン群（予約キャンセル等）の横（.gaia-app-statusbar-actionmenu）を探す
      var actionMenu = document.querySelector('.gaia-app-statusbar-actionmenu') || document.querySelector('.gaia-app-statusbar');
      if (actionMenu) {
        header = actionMenu;
      } else {
        // 見つからなければ標準のヘッダースペースにフォールバック
        header = kintone.app.record.getHeaderMenuSpaceElement();
      }
    }

    if (!header) return event;

    var hasFacility = !!facilityFieldCode && !!record[facilityFieldCode];
    var currentFacility = hasFacility ? record[facilityFieldCode].value : '';

    // ボタン格納用コンテナの作成
    var navContainer = document.createElement('div');
    navContainer.id = 'custom-datetime-nav-container';
    if (isMobile && hasFacility) {
      // トグルを表示するときだけ折り返し配置にする（それ以外は従来どおり）
      navContainer.style.display = 'flex';
      navContainer.style.flexWrap = 'wrap';
      navContainer.style.gap = '8px';
      navContainer.style.marginLeft = '0';
    } else {
      navContainer.style.display = 'inline-block';
      navContainer.style.marginLeft = '20px';
    }
    var useFlex = isMobile && hasFacility;

    // ボタンの共通スタイル定義（既存のプロセス管理ボタンの横軸に綺麗に並ぶよう微調整）
    var applyBtnStyle = function(btn) {
      btn.style.padding = '0 16px';
      btn.style.height = '40px'; 
      btn.style.border = '1px solid #e3e7e8';
      btn.style.backgroundColor = '#f7f9fa';
      btn.style.color = '#3498db';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px';
      btn.style.verticalAlign = 'middle'; // 横並びの軸ズレを防止
    };

    // 前へボタン
    var prevButton = document.createElement('button');
    prevButton.innerText = '◀ 前のレコード';
    applyBtnStyle(prevButton);
    prevButton.style.marginRight = useFlex ? '0' : '8px'; // flex 時は gap で間隔を取る

    // 次へボタン
    var nextButton = document.createElement('button');
    nextButton.innerText = '次のレコード ▶';
    applyBtnStyle(nextButton);

    // ホバーエフェクトの付与
    var applyHover = function(btn) {
      btn.onmouseover = function() { btn.style.backgroundColor = '#e3e7e8'; };
      btn.onmouseout = function() { btn.style.backgroundColor = '#f7f9fa'; };
    };
    applyHover(prevButton);
    applyHover(nextButton);

    navContainer.appendChild(prevButton);
    navContainer.appendChild(nextButton);
    header.appendChild(navContainer);

    var appId = getAppId(isMobile);

    // 「同一施設のみ」トグル（施設フィールド設定済みかつレコードに存在する場合のみ）
    var storageKey = 'dtnav:' + PLUGIN_ID + ':' + appId + ':sameFacility';
    var sameFacilityOnly = Core.readToggle(getStorage(), storageKey, false);
    if (hasFacility) {
      var toggleLabel = document.createElement('label');
      toggleLabel.style.display = 'inline-flex';
      toggleLabel.style.alignItems = 'center';
      toggleLabel.style.height = '40px';
      toggleLabel.style.verticalAlign = 'middle';
      toggleLabel.style.marginRight = isMobile ? '0' : '12px';
      toggleLabel.style.color = '#3498db';
      toggleLabel.style.fontSize = '14px';
      toggleLabel.style.cursor = 'pointer';
      if (isMobile) toggleLabel.style.flexBasis = '100%';

      var toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.style.marginRight = '4px';
      toggleLabel.appendChild(toggle);
      toggleLabel.appendChild(document.createTextNode('同一施設のみ'));

      if (!currentFacility) {
        toggle.checked = false;
        toggle.disabled = true;
        toggleLabel.title = '施設が未入力のため絞り込みできません';
      } else {
        toggle.checked = sameFacilityOnly;
        var members = Core.getSameGroupMembers(currentFacility, facilityGroups);
        if (members.length >= 2) {
          toggleLabel.title = '対象施設: ' + members.join('・');
        }
        toggle.addEventListener('change', function() {
          sameFacilityOnly = toggle.checked;
          Core.writeToggle(getStorage(), storageKey, sameFacilityOnly);
        });
      }
      navContainer.insertBefore(toggleLabel, navContainer.firstChild);
    }

    /**
     * 絞り込み条件を組み立てる
     */
    var buildFilters = function() {
      return Core.buildFilters({
        sameFacilityOnly: sameFacilityOnly,
        hasFacility: hasFacility,
        currentFacility: currentFacility,
        facilityFieldCode: facilityFieldCode,
        facilityGroups: facilityGroups,
        excludeFieldCode: excludeFieldCode,
        excludeValues: excludeValues,
        record: record
      });
    };

    /**
     * レコード取得および画面遷移
     */
    var navigateRecord = function(isNext) {
      var f = buildFilters();
      var query = Core.buildNavQuery({
        targetFieldCode: targetFieldCode,
        currentDatetime: currentDatetime,
        currentId: currentId,
        isNext: isNext,
        filters: f.filters
      });
      if (query === null) {
        alert('レコードの取得に失敗しました。');
        return;
      }
      kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
        app: appId,
        query: query,
        fields: ['$id']
      }).then(function(resp) {
        if (resp.records && resp.records.length > 0) {
          var targetId = resp.records[0].$id.value;
          location.href = '/k/' + appId + '/show#record=' + targetId;
        } else {
          alert(Core.buildNotFoundMessage(isNext, f.scopeMembers));
        }
      }).catch(function(err) {
        console.error('レコード取得エラー:', err);
        alert('レコードの取得に失敗しました。');
      });
    };

    prevButton.addEventListener('click', function() { navigateRecord(false); });
    nextButton.addEventListener('click', function() { navigateRecord(true); });

    // モバイル版のスワイプ操作対応（SPA環境での重複登録を防止）
    if (isMobile) {
      // 最新のナビゲーション関数をグローバルに保持
      window._mobileSwipeNavigateRecord = navigateRecord;
      
      // 初回のみスワイプイベントをドキュメントに登録
      if (!window._kintoneSwipeInitialized) {
        window._kintoneSwipeInitialized = true;
        var startX = 0, startY = 0;
        
        document.addEventListener('touchstart', function(e) {
          startX = e.changedTouches[0].screenX;
          startY = e.changedTouches[0].screenY;
        }, {passive: true});
        
        document.addEventListener('touchend', function(e) {
          var endX = e.changedTouches[0].screenX;
          var endY = e.changedTouches[0].screenY;
          var diffX = endX - startX;
          var diffY = endY - startY;
          
          // 縦方向のスクロール動作を除外するため、X方向の移動量がY方向より大きい場合のみ判定
          // 誤動作を防ぐため一定距離（最低60px）スワイプしたことを条件とする
          if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 60) {
            if (typeof window._mobileSwipeNavigateRecord === 'function') {
              // diffX < 0 (左方向へのスワイプ) = 「次へ」
              // diffX > 0 (右方向へのスワイプ) = 「前へ」
              window._mobileSwipeNavigateRecord(diffX < 0);
            }
          }
        }, {passive: true});
      }
    }

    return event;
  });

})(kintone.$PLUGIN_ID);
