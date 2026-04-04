(function(PLUGIN_ID) {
  'use strict';

  // 保存されている設定値の取得
  var conf = kintone.plugin.app.getConfig(PLUGIN_ID);
  var targetFieldCode = conf.targetFieldCode;

  if (!targetFieldCode) {
    console.error('日時基準ナビゲーション: 基準フィールドが設定されていません。プラグイン設定画面から保存してください。');
    return;
  }

  // レコード詳細画面の表示時イベント（PC版とモバイル版の両方に対応）
  kintone.events.on(['app.record.detail.show', 'mobile.app.record.detail.show'], function(event) {
    var record = event.record;
    var currentId = Number(record.$id.value);
    var isMobile = event.type === 'mobile.app.record.detail.show';
    
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

    if (!header || document.getElementById('custom-datetime-nav-container')) {
      return event;
    }

    // ボタン格納用コンテナの作成
    var navContainer = document.createElement('div');
    navContainer.id = 'custom-datetime-nav-container';
    navContainer.style.display = 'inline-block';
    navContainer.style.marginLeft = '20px';

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
    prevButton.style.marginRight = '8px';

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

    var appId = kintone.app.getId();

    /**
     * API検索用のクエリ文を作成する関数
     */
    var getQuery = function(isNext) {
      var op1 = isNext ? '>' : '<';
      var op2 = isNext ? 'asc' : 'desc';
      // 同じ日時/日付の場合はレコード番号で判定する複合条件
      return '(' + targetFieldCode + ' ' + op1 + ' "' + currentDatetime + '") or (' + targetFieldCode + ' = "' + currentDatetime + '" and $id ' + op1 + ' ' + currentId + ') order by ' + targetFieldCode + ' ' + op2 + ', $id ' + op2 + ' limit 1';
    };

    /**
     * レコード取得および画面遷移
     */
    var navigateRecord = function(isNext) {
      var query = getQuery(isNext);
      kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
        app: appId,
        query: query,
        fields: ['$id']
      }).then(function(resp) {
        if (resp.records && resp.records.length > 0) {
          var targetId = resp.records[0].$id.value;
          location.href = '/k/' + appId + '/show#record=' + targetId;
        } else {
          var msg = isNext ? 'これ以上新しいレコードはありません。' : 'これ以上古いレコードはありません。';
          alert(msg);
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
