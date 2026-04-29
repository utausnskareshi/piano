// Landing / help screen. First screen shown on a fresh visit.
// Explains how to install on iOS and Android, and summarises the 3 play modes.

export function renderLanding(root: HTMLElement) {
  root.innerHTML = '';
  const main = document.createElement('main');
  main.className = 'landing';
  main.innerHTML = `
    <header class="landing-hero">
      <div class="logo-mark" aria-hidden="true">
        <span class="key w"></span><span class="key w"></span><span class="key w"></span>
        <span class="key w"></span><span class="key w"></span><span class="key w"></span>
        <span class="key w"></span>
      </div>
      <h1>Piano</h1>
      <p class="tagline">3オクターブ・100音色・50曲収録のシンセサイザー PWA</p>
      <button class="btn-primary" id="enter-btn">演奏を始める</button>
    </header>

    <section class="install-block">
      <h2>ホーム画面に追加（オフライン対応）</h2>
      <div class="install-grid">
        <article>
          <h3>iPhone / iPad (Safari)</h3>
          <ol>
            <li>下の <b>共有ボタン</b>（□に上矢印）をタップ</li>
            <li><b>「ホーム画面に追加」</b> を選択</li>
            <li>右上の <b>「追加」</b> を押すとアプリとして起動できます</li>
          </ol>
        </article>
        <article>
          <h3>Android (Chrome)</h3>
          <ol>
            <li>右上の <b>︙メニュー</b> をタップ</li>
            <li><b>「アプリをインストール」</b> または「ホーム画面に追加」を選択</li>
            <li>確認画面で <b>「インストール」</b> を押すと完了</li>
          </ol>
        </article>
      </div>
      <p class="note">一度開けばオフラインでも動作します。ネット接続不要で演奏可能です。</p>
    </section>

    <section class="features-block">
      <h2>3つの演奏モード</h2>
      <div class="features-grid">
        <article>
          <h3>① 自由演奏モード</h3>
          <p>鍵盤を自由に弾けます。100音色から選んで好きな曲を演奏しましょう。録音もできます。</p>
        </article>
        <article>
          <h3>② 学習モード</h3>
          <p>選んだ曲の <b>次に押すべき鍵盤</b> がハイライトされます。間違えても止まらず、優しくガイドします。</p>
        </article>
        <article>
          <h3>③ 自動演奏モード</h3>
          <p>どの鍵盤を押しても、選んだ曲の音が <b>順番どおり</b> に鳴ります。リズム感だけで演奏できます。</p>
        </article>
      </div>
    </section>

    <section class="usage-block">
      <h2>使い方のヒント</h2>
      <ul>
        <li>画面上部の <b>◀ ▶</b> ボタンで表示中のオクターブを切り替えできます（中央／低／高）。</li>
        <li>下部メニューから <b>音色</b>・<b>曲</b> を切り替え、自由演奏に戻ると反映されます。</li>
        <li>新しい曲は <b>曲追加</b> 画面から <code>C D E F G A B C+</code> のように貼り付けて登録できます。</li>
        <li>休符は <code>_</code>、半音は <code>#</code>、低オクターブは <code>-</code>、高オクターブは <code>+</code> です。</li>
        <li>横画面にすると鍵盤が広く表示されて演奏しやすくなります。</li>
      </ul>
    </section>

    <section class="usage-block">
      <h2>録音した曲の再生方法</h2>
      <p>自由演奏モードで <b>● 録音</b> ボタンを押して演奏すると、もう一度押したときに「マイ曲」として保存されます。録音は音声ファイルではなく <b>ノート列（楽譜データ）</b> としてアプリ内に保存され、以下の手順で再生できます。</p>
      <ol>
        <li>演奏画面 下部メニューの <b>「曲を選ぶ」</b> をタップ</li>
        <li>上のカテゴリタブから <b>「マイ曲」</b> を選択</li>
        <li>録音ファイル（例: <code>録音 2026/4/29 21:30:42</code>）の <b>「選ぶ」</b> をタップ</li>
        <li>自動で演奏画面に戻る</li>
        <li>モードタブで <b>「自動」</b> を選択</li>
        <li><b>どの鍵盤でもよいので連打</b>すると、録音した音が順番に再生されます</li>
      </ol>
      <p class="note">※録音データは iPhone の写真や Files アプリには保存されません。本アプリ内（IndexedDB）にのみ保存されます。後から音色を変えて聴き直すこともできます。</p>
    </section>

    <footer class="landing-footer">
      <button class="btn-secondary" id="enter-btn-2">演奏画面へ</button>
      <p class="copyright">標準収録曲はすべてパブリックドメインまたは独自編曲です。</p>
    </footer>
  `;
  root.appendChild(main);
  const go = () => { location.hash = '#/play'; };
  main.querySelector('#enter-btn')!.addEventListener('click', go);
  main.querySelector('#enter-btn-2')!.addEventListener('click', go);
}
