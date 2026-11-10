import { createArena } from './arena';
import portraitUrl from '../../../prints/весь.png';
import {
  BOX_STARS,
  SUBSCRIPTION_STARS,
  developerToolsEnabled,
  grantDeveloperResources,
  openBox,
  purchaseBox,
  purchaseSubscription,
  subscriptionActive,
  watchRewardedAd,
} from './monetization';
import {
  DEFAULT_PROFILE,
  STORAGE_KEY,
  type PlayerProfile,
  type SkinName,
  type StatName,
} from './types';
import './style.css';

type ViewName = 'arena' | 'forge' | 'hero' | 'market';
type ApiResponse<T> = T & { error?: string };

function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) throw new Error('Application root was not found.');
  return root;
}

const app = getAppRoot();

const telegram = window.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
telegram?.disableVerticalSwipes();

let profile = loadLocalProfile();
let activeView: ViewName = 'arena';
let arenaGame: Phaser.Game | undefined;
let apiConnected = false;
let attackLocked = false;
let battleStarted = false;
let toastTimer: number | undefined;

function loadLocalProfile(): PlayerProfile {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_PROFILE };
    const parsed: Partial<PlayerProfile> = JSON.parse(saved);
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      unlockedSkins: Array.isArray(parsed.unlockedSkins)
        ? parsed.unlockedSkins
        : DEFAULT_PROFILE.unlockedSkins,
      boxes: typeof parsed.boxes === 'number' ? parsed.boxes : 0,
      subscriptionUntil: typeof parsed.subscriptionUntil === 'number' ? parsed.subscriptionUntil : 0,
      developer: developerToolsEnabled() && parsed.developer === true,
    };
  } catch (error) {
    console.error('Could not read the saved gladiator profile.', error);
    return { ...DEFAULT_PROFILE };
  }
}

function saveLocalProfile(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

async function apiRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (telegram?.initData) headers.authorization = `tma ${telegram.initData}`;

  const response = await fetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok) throw new Error(payload.error ?? `Ошибка сервера (${response.status})`);
  return payload;
}

async function connectProfile(): Promise<void> {
  if (!telegram?.initData) return;
  try {
    profile = await apiRequest<PlayerProfile>('/api/profile');
    apiConnected = true;
    saveLocalProfile();
  } catch (error) {
    console.error('The online profile could not be loaded.', error);
    showToast('Сервер недоступен. Играем в автономном режиме.');
  }
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function statPrice(stat: StatName): number {
  const current = profile[stat];
  return 30 + (current - (stat === 'vitality' ? 100 : stat === 'strength' ? 10 : 1)) * 12;
}

async function upgradeStat(stat: StatName): Promise<void> {
  const price = statPrice(stat);
  if (profile.gold < price) {
    showToast('Не хватает золота. Проведи бой на арене.');
    return;
  }
  try {
    if (apiConnected) {
      profile = await apiRequest<PlayerProfile>('/api/progression/upgrade', 'POST', { stat });
    } else {
      profile.gold -= price;
      profile[stat] += stat === 'vitality' ? 10 : 1;
    }
    saveLocalProfile();
    render();
    showToast('Характеристика улучшена.');
  } catch (error) {
    console.error('Could not upgrade the gladiator.', error);
    showToast(error instanceof Error ? error.message : 'Не удалось улучшить характеристику.');
  }
}

async function buySkin(skin: SkinName): Promise<void> {
  const cost = skin === 'ember' ? 80 : 110;
  if (profile.unlockedSkins.includes(skin)) {
    profile.skin = skin;
  } else if (profile.gold < cost) {
    showToast('Не хватает золота для этого образа.');
    return;
  } else if (apiConnected) {
    try {
      profile = await apiRequest<PlayerProfile>('/api/cosmetics/buy', 'POST', { skin });
    } catch (error) {
      console.error('Could not purchase the cosmetic.', error);
      showToast(error instanceof Error ? error.message : 'Не удалось купить образ.');
      return;
    }
  } else {
    profile.gold -= cost;
    profile.unlockedSkins.push(skin);
    profile.skin = skin;
  }
  if (apiConnected && profile.unlockedSkins.includes(skin)) {
    try {
      profile = await apiRequest<PlayerProfile>('/api/cosmetics/equip', 'POST', { skin });
    } catch (error) {
      console.error('Could not equip the cosmetic.', error);
      showToast(error instanceof Error ? error.message : 'Не удалось надеть образ.');
      return;
    }
  }
  saveLocalProfile();
  render();
}

function render(): void {
  arenaGame?.destroy(true);
  arenaGame = undefined;

  app.innerHTML = `
    <div class="game-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="На арену">
          <span class="brand-mark">G</span>
          <span class="brand-name">GLADIATORS<small>ПУТЬ ЧЕМПИОНА</small></span>
        </a>
        <div class="topbar-right">
          <span class="connection ${apiConnected ? 'online' : ''}"><i></i>${apiConnected ? 'СИНХРОНИЗИРОВАНО' : 'АВТОНОМНО'}</span>
          <span class="wallet"><span class="coin">✦</span><strong>${profile.gold}</strong></span>
          <span class="wallet boxes-wallet"><span class="coin">▣</span><strong>${profile.boxes}</strong></span>
          <button class="avatar" data-view="hero" aria-label="Профиль">${profile.username.slice(0, 1).toUpperCase()}</button>
        </div>
      </header>
      <main class="layout">
        <aside class="sidebar">
          <div class="sidebar-label">МЕНЮ</div>
          <button class="nav-item ${activeView === 'arena' ? 'active' : ''}" data-view="arena"><span class="nav-icon">⚔</span> Арена <span class="nav-arrow">›</span></button>
          <button class="nav-item ${activeView === 'forge' ? 'active' : ''}" data-view="forge"><span class="nav-icon">⌘</span> Арсенал</button>
          <button class="nav-item ${activeView === 'hero' ? 'active' : ''}" data-view="hero"><span class="nav-icon">♙</span> Гладиатор</button>
          <button class="nav-item ${activeView === 'market' ? 'active' : ''}" data-view="market"><span class="nav-icon">▣</span> Лавка</button>
          <div class="side-card">
            <div class="side-card-top"><span class="rank-emblem">Ⅰ</span><span>ТЕКУЩИЙ РАНГ</span></div>
            <strong>Новичок</strong>
            <div class="rank-progress"><i style="width:${Math.min(100, (profile.xp % 100))}%"></i></div>
            <small>${profile.xp % 100} / 100 XP до уровня ${profile.level + 1}</small>
          </div>
          <div class="sidebar-footer">СОЗДАНО ДЛЯ АРЕНЫ<br><span>Сезон I · Пески славы</span></div>
        </aside>
        <section class="content">
          ${activeView === 'arena' ? renderArena() : activeView === 'forge' ? renderForge() : activeView === 'hero' ? renderHero() : renderMarket()}
        </section>
      </main>
      <nav class="mobile-nav">
        <button data-view="arena" class="${activeView === 'arena' ? 'active' : ''}"><span>⚔</span>Арена</button>
        <button data-view="forge" class="${activeView === 'forge' ? 'active' : ''}"><span>⌘</span>Арсенал</button>
        <button data-view="hero" class="${activeView === 'hero' ? 'active' : ''}"><span>♙</span>Герой</button>
        <button data-view="market" class="${activeView === 'market' ? 'active' : ''}"><span>▣</span>Лавка</button>
      </nav>
      <div id="toast" class="toast" role="status"></div>
    </div>`;
  bindNavigation();
  if (activeView === 'arena') mountArena();
  if (activeView === 'forge') bindForge();
  if (activeView === 'hero') bindHero();
  if (activeView === 'market') bindMarket();
}

function renderArena(): string {
  return `
    <div class="page-heading">
      <div><div class="eyebrow"><span class="eyebrow-line"></span> СЕЗОН I · ПЕСЧАНАЯ АРЕНА</div><h1>Докажи, <em>кто достоин.</em></h1><p>Один на один. Только мастерство и верный момент.</p></div>
      <div class="rank-chip"><span>Ⅰ</span><div><small>ТВОЙ РАНГ</small><strong>Новичок</strong></div></div>
    </div>
    <div class="arena-card">
      <div class="arena-topline"><span class="fight-type"><i></i> ТРЕНИРОВОЧНЫЙ БОЙ</span><span class="round-label">БЕСТРУПОРНЫЙ · 1 НА 1</span></div>
      <div class="fighter-panels">
        <div class="fighter-info player-info"><div class="fighter-name">${escapeHtml(profile.username)}<span>УРОВЕНЬ ${profile.level}</span></div><div class="health-track"><i id="player-health" style="width:100%"></i></div><div class="health-caption"><span>ЗДОРОВЬЕ</span><b id="player-hp">${profile.vitality} / ${profile.vitality}</b></div></div>
        <div class="fighter-info enemy-info"><div class="fighter-name">МАРКУС «ВОЛК»<span>СОПЕРНИК · УР. ${profile.level}</span></div><div class="health-track enemy-track"><i id="enemy-health" style="width:100%"></i></div><div class="health-caption"><span>ЗДОРОВЬЕ</span><b id="enemy-hp">110 / 110</b></div></div>
      </div>
      <div id="arena-canvas" class="arena-canvas"></div>
      <div id="floating-damage" class="floating-damage" aria-live="polite"></div>
      <div class="arena-caption"><span class="caption-dot"></span><span id="battle-status">Соперник ждёт вызова</span><span class="arena-caption-right">АРЕНА I</span></div>
      <div class="controls">
        <button id="block-button" class="action-button block-button" aria-label="Блокировать удар"><span class="button-glyph">◈</span><span>БЛОК</span><small>Поймай момент</small></button>
        <button id="attack-button" class="action-button attack-button" aria-label="Атаковать"><span class="button-glyph">⚔</span><span>АТАКА</span><small>Нанеси удар</small></button>
      </div>
      <div class="arena-hint"><span>✦</span> Нажми «Блок» точно перед ударом — идеальная защита оглушит соперника.</div>
    </div>
    <div class="bottom-strip"><span>ТВОЙ ГЛАДИАТОР</span><strong>УР. ${profile.level}</strong><i></i><span>СИЛА ${profile.strength}</span><i></i><span>ОРУЖИЕ +${profile.weapon}</span><button data-view="forge">УЛУЧШИТЬ <b>↗</b></button></div>`;
}

function renderForge(): string {
  const stats: { key: StatName; title: string; caption: string; icon: string }[] = [
    { key: 'strength', title: 'Сила', caption: 'Больше урона за каждый удар.', icon: '⚔' },
    { key: 'vitality', title: 'Живучесть', caption: 'Больше здоровья в бою.', icon: '♡' },
    { key: 'weapon', title: 'Мастерство оружия', caption: 'Удар мощнее, защита надёжнее.', icon: '⌁' },
  ];
  return `
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> МАСТЕРСКАЯ</div><h1>Стань <em>сильнее.</em></h1><p>Путь чемпиона начинается с тренировки.</p></div></div>
    <div class="forge-layout">
      <div class="forge-main">
        <div class="section-title"><span>ХАРАКТЕРИСТИКИ</span><i></i><small>УЛУЧШАЙ ЗА ЗОЛОТО</small></div>
        <div class="stats-list">${stats.map(({ key, title, caption, icon }) => {
          const value = profile[key];
          const price = statPrice(key);
          const progress = key === 'vitality' ? Math.min(value / 170 * 100, 100) : Math.min(value / 50 * 100, 100);
          return `<article class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-copy"><strong>${title}</strong><small>${caption}</small><div class="stat-progress"><i style="width:${progress}%"></i></div></div><div class="stat-value"><strong>${value}</strong><small>УРОВЕНЬ</small></div><button class="upgrade-button" data-upgrade="${key}"><span>✦ ${price}</span><b>+</b></button></article>`;
        }).join('')}</div>
      </div>
      <aside class="forge-aside"><div class="forge-ornament">⚒</div><div class="eyebrow">ПУТЬ К ЧЕМПИОНСТВУ</div><h2>Каждый удар<br>имеет значение.</h2><p>Испытай обновлённую силу на арене. Победы приносят золото и опыт.</p><div class="reward-row"><span>НАГРАДА ЗА ПОБЕДУ</span><strong>✦ 25–35</strong></div><button class="primary-button" data-view="arena">ВЕРНУТЬСЯ НА АРЕНУ <b>→</b></button></aside>
    </div>
    <div class="section-title cosmetics-title"><span>ОБЛИКИ</span><i></i><small>ТВОЙ СТИЛЬ · ТВОИ ПРАВИЛА</small></div>
    <div class="skin-list">${skinCard('bronze', 'Бронзовый легион', 'КЛАССИЧЕСКИЙ', 0)}${skinCard('ember', 'Пепел арены', 'ОБРАЗ · I', 80)}${skinCard('azure', 'Страж севера', 'ОБРАЗ · II', 110)}</div>`;
}

function skinCard(skin: SkinName, title: string, label: string, price: number): string {
  const owned = profile.unlockedSkins.includes(skin);
  return `<button class="skin-card skin-${skin} ${profile.skin === skin ? 'equipped' : ''}" data-skin="${skin}"><span class="skin-swatch"></span><span class="skin-copy"><small>${label}</small><strong>${title}</strong></span><span class="skin-action">${profile.skin === skin ? 'НАДЕТ' : owned ? 'ВЫБРАТЬ' : `✦ ${price}`}</span></button>`;
}

function renderHero(): string {
  return `
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> ЗАЛ СЛАВЫ</div><h1>Твоя <em>легенда.</em></h1><p>Каждый великий боец когда-то начинал с первой победы.</p></div></div>
    <section class="hero-card"><div class="hero-portrait skin-${profile.skin}"><div class="portrait-glow"></div><img class="portrait-art" src="${portraitUrl}" alt=""><span class="portrait-level">УР. ${profile.level}</span></div><div class="hero-details"><div class="eyebrow">ГЛАДИАТОР · НОВИЧОК</div><h2>${escapeHtml(profile.username)}</h2><p>Боец песчаной арены</p><div class="hero-xp"><span>ОПЫТ</span><b>${profile.xp % 100} / 100 XP</b></div><div class="stat-progress"><i style="width:${profile.xp % 100}%"></i></div><div class="hero-stat-grid"><div><small>СИЛА</small><strong>${profile.strength}</strong></div><div><small>ЗДОРОВЬЕ</small><strong>${profile.vitality}</strong></div><div><small>ОРУЖИЕ</small><strong>+${profile.weapon}</strong></div><div><small>ПОБЕДЫ</small><strong>${Math.floor(profile.xp / 35)}</strong></div></div></div></section>
    <div class="section-title hero-section-title"><span>ПРОГРЕСС</span><i></i><small>СЕЗОН I</small></div><section class="progress-card"><div class="progress-emblem">Ⅰ</div><div><strong>Пески славы</strong><p>Сражайся, зарабатывай опыт и открывай новые облики.</p></div><div class="progress-level"><small>ТЕКУЩИЙ УРОВЕНЬ</small><b>${profile.level}</b></div></section>
    <button class="primary-button hero-arena-button" data-view="arena">ВЫЙТИ НА АРЕНУ <b>→</b></button>`;
}

function renderMarket(): string {
  const subscribed = subscriptionActive(profile);
  const until = subscribed
    ? new Date(profile.subscriptionUntil).toLocaleDateString('ru-RU')
    : 'не активна';
  const developer = developerToolsEnabled()
    ? `<button class="primary-button developer-grant" data-developer="grant"><span>РЕСУРСЫ РАЗРАБОТЧИКА</span><b>→</b></button><p class="market-note">Только в этой сборке для разработки: золото, все облики, подписка и 20 ящиков. Реклама и счета Stars после этого не требуются.</p>`
    : '';
  return `
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> TELEGRAM · STARS</div><h1>Лавка <em>арены.</em></h1><p>Реклама, подписка и ящики остаются внутри мини-приложения.</p></div></div>
    <div class="market-grid">
      <article class="market-card">
        <small>ПОДПИСКА · 30 ДНЕЙ</small>
        <strong>Пески славы</strong>
        <p>+15% золота за бой и ящик при оформлении. Оплата — ${SUBSCRIPTION_STARS} звёзд Telegram.</p>
        <div class="reward-row"><span>СТАТУС</span><strong>${subscribed ? `до ${until}` : until}</strong></div>
        <button class="primary-button" data-market="subscribe"><span>${subscribed ? 'ПРОДЛИТЬ' : 'ОФОРМИТЬ'}</span><b>★ ${SUBSCRIPTION_STARS}</b></button>
      </article>
      <article class="market-card">
        <small>РЕКЛАМА</small>
        <strong>Ролик спонсора</strong>
        <p>Досмотрите рекламу в окне мини-приложения и получите один ящик.</p>
        <button class="primary-button" data-market="ad"><span>СМОТРЕТЬ</span><b>+1 ▣</b></button>
      </article>
      <article class="market-card">
        <small>ЯЩИКИ · ${profile.boxes}</small>
        <strong>Ящик арены</strong>
        <p>Золото, сила, оружие или новый облик. Покупка — ${BOX_STARS} звёзд Telegram.</p>
        <div class="market-actions">
          <button class="primary-button" data-market="buy-box"><span>КУПИТЬ</span><b>★ ${BOX_STARS}</b></button>
          <button class="upgrade-button" data-market="open-box"><span>ОТКРЫТЬ</span><b>▣</b></button>
        </div>
      </article>
    </div>
    ${developer}`;
}

function bindNavigation(): void {
  app.querySelectorAll<HTMLElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      if (view === 'arena' || view === 'forge' || view === 'hero' || view === 'market') {
        activeView = view;
        render();
      }
    });
  });
}

function bindMarket(): void {
  app.querySelector('[data-developer="grant"]')?.addEventListener('click', () => {
    grantDeveloperResources(profile);
    saveLocalProfile();
    render();
    showToast('Ресурсы разработчика выданы.');
  });
  app.querySelector('[data-market="subscribe"]')?.addEventListener('click', () => {
    void runMarketAction(() => purchaseSubscription(profile));
  });
  app.querySelector('[data-market="ad"]')?.addEventListener('click', () => {
    void runMarketAction(() => watchRewardedAd(profile));
  });
  app.querySelector('[data-market="buy-box"]')?.addEventListener('click', () => {
    void runMarketAction(() => purchaseBox(profile));
  });
  app.querySelector('[data-market="open-box"]')?.addEventListener('click', () => {
    const message = openBox(profile);
    saveLocalProfile();
    render();
    showToast(message);
  });
}

async function runMarketAction(action: () => Promise<string>): Promise<void> {
  const message = await action();
  saveLocalProfile();
  render();
  showToast(message);
}

function bindForge(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((button) => {
    button.addEventListener('click', () => {
      const stat = button.dataset.upgrade;
      if (stat === 'strength' || stat === 'vitality' || stat === 'weapon') void upgradeStat(stat);
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => {
    button.addEventListener('click', () => {
      const skin = button.dataset.skin;
      if (skin === 'bronze' || skin === 'ember' || skin === 'azure') void buySkin(skin);
    });
  });
}

function bindHero(): void {
  app.querySelector('.avatar')?.classList.add('selected');
}

function mountArena(): void {
  const mount = app.querySelector<HTMLElement>('#arena-canvas');
  if (!mount) return;
  battleStarted = false;
  arenaGame = createArena(mount, profile, onArenaEvent);
  app.querySelector('#attack-button')?.addEventListener('click', attack);
  app.querySelector<HTMLButtonElement>('#block-button')?.addEventListener('pointerdown', block);
}

function attack(): void {
  if (attackLocked) return;
  const scene = arenaGame?.scene.getScene('Arena') as Phaser.Scene | undefined;
  if (!battleStarted) {
    scene?.events.emit('battle:start');
    battleStarted = true;
  }
  scene?.events.emit('battle:attack');
  attackLocked = true;
  const button = app.querySelector<HTMLButtonElement>('#attack-button');
  button?.classList.add('pressed');
  window.setTimeout(() => {
    attackLocked = false;
    button?.classList.remove('pressed');
  }, 440);
}

function block(event: PointerEvent): void {
  event.preventDefault();
  if (!battleStarted || !arenaGame) return;
  const scene = arenaGame?.scene.getScene('Arena') as Phaser.Scene | undefined;
  scene?.events.emit('battle:block');
  const button = app.querySelector<HTMLButtonElement>('#block-button');
  button?.classList.add('pressed');
  window.setTimeout(() => button?.classList.remove('pressed'), 250);
}

function onArenaEvent(event: string, value?: unknown): void {
  if (event === 'arena:health' && value && typeof value === 'object') {
    const health = value as { player: number; maxPlayer: number; opponent: number; maxOpponent: number };
    setText('#player-hp', `${health.player} / ${health.maxPlayer}`);
    setText('#enemy-hp', `${health.opponent} / ${health.maxOpponent}`);
    setWidth('#player-health', health.player / health.maxPlayer);
    setWidth('#enemy-health', health.opponent / health.maxOpponent);
    document.querySelector('#player-health')?.classList.toggle('low', health.player / health.maxPlayer < 0.3);
    return;
  }
  if (event === 'arena:telegraph') {
    setText('#battle-status', 'Соперник замахивается — приготовься блокировать');
    document.querySelector('.caption-dot')?.classList.add('warning');
    return;
  }
  if (event === 'arena:ready') {
    setText('#battle-status', 'Нажми «Атака», чтобы начать бой');
    return;
  }
  if (event === 'arena:damage' && value && typeof value === 'object') {
    const hit = value as { side: string; amount: number; critical: boolean };
    const damage = document.querySelector<HTMLDivElement>('#floating-damage');
    if (damage) {
      damage.textContent = hit.side === 'opponent'
        ? `${hit.critical ? 'ИДЕАЛЬНО! ' : ''}−${hit.amount} УРОНА`
        : `−${hit.amount} ЗДОРОВЬЯ`;
      damage.classList.remove('animate');
      void damage.offsetWidth;
      damage.classList.add('animate');
    }
    setText('#battle-status', hit.side === 'opponent' ? `Точный удар: ${hit.amount} урона` : `Ты получил ${hit.amount} урона`);
    document.querySelector('.caption-dot')?.classList.remove('warning');
    return;
  }
  if (event === 'arena:finished' && value && typeof value === 'object') {
    const result = value as { won: boolean; gold: number; xp: number };
    battleStarted = false;
    app.querySelector<HTMLButtonElement>('#attack-button')?.setAttribute('disabled', '');
    app.querySelector<HTMLButtonElement>('#block-button')?.setAttribute('disabled', '');
    const gold = subscriptionActive(profile) ? Math.round(result.gold * 1.15) : result.gold;
    profile.gold += gold;
    profile.xp += result.xp;
    while (profile.xp >= 100) {
      profile.xp -= 100;
      profile.level += 1;
    }
    saveLocalProfile();
    showToast(`${result.won ? 'Победа!' : 'Бой окончен.'} +${gold} золота · +${result.xp} XP`);
    const status = document.querySelector('#battle-status');
    if (status) status.textContent = `${result.won ? 'Победа! ' : 'Поражение. '}Награда: ${gold} золота · ${result.xp} XP`;
    window.setTimeout(() => {
      if (activeView === 'arena') render();
    }, 2400);
  }
}

function setText(selector: string, value: string): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setWidth(selector: string, ratio: number): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

void (async () => {
  await connectProfile();
  render();
})();
