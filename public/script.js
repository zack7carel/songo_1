// =====================================================
// API — routes Node.js (même interface qu'avant)
// =====================================================
const API = {
  register:     '/api/register',
  login:        '/api/login',
  logout:       '/api/logout',
  checkSession: '/api/check_session',
  saveGame:     '/api/save_game',
  getHistory:   '/api/get_history',
  clearHistory: '/api/clear_history',
};

async function apiPost(url, data = {}) {
  const res = await fetch(url, {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify(data),
  });
  return res.json();
}

async function apiGet(url) {
  const res = await fetch(url, { credentials: 'include' });
  return res.json();
}

// =====================================================
// ÉTAT GLOBAL
// =====================================================
let currentUser = null;
let isGuest     = false;

// =====================================================
// UTILITAIRES UI
// =====================================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'page-history') loadAndRenderHistory();
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}
function clearAuthError() {
  document.getElementById('auth-error').style.display = 'none';
}

function switchTab(tab) {
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  clearAuthError();
}

function setBtnLoading(id, loading, label) {
  const btn = document.getElementById(id);
  btn.disabled    = loading;
  btn.textContent = loading ? 'Chargement…' : label;
}

// =====================================================
// AUTH
// =====================================================
async function handleRegister() {
  clearAuthError();
  const pseudo   = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!pseudo)             return showAuthError('Veuillez entrer un pseudo.');
  if (!email)              return showAuthError('Veuillez entrer un email.');
  if (password.length < 8) return showAuthError('Mot de passe : 8 caractères minimum.');

  setBtnLoading('btn-register', true, 'Créer un compte');
  const res = await apiPost(API.register, { pseudo, email, password });
  setBtnLoading('btn-register', false, 'Créer un compte');

  if (!res.success) return showAuthError(res.error);
  showToast('Compte créé ! Connectez-vous.');
  switchTab('login');
}

async function handleLogin() {
  clearAuthError();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) return showAuthError('Email et mot de passe requis.');

  setBtnLoading('btn-login', true, 'Se connecter');
  const res = await apiPost(API.login, { email, password });
  setBtnLoading('btn-login', false, 'Se connecter');

  if (!res.success) return showAuthError(res.error);

  currentUser = { user_id: res.user_id, pseudo: res.pseudo };
  isGuest = false;
  enterApp();
}

function handleGuest() {
  currentUser = null;
  isGuest     = true;
  enterApp();
}

async function handleLogout() {
  if (!isGuest) await apiPost(API.logout);
  currentUser = null;
  isGuest     = false;
  showPage('page-auth');
}

async function checkSession() {
  try {
    const res = await apiGet(API.checkSession);
    if (res.logged_in) {
      currentUser = { user_id: res.user_id, pseudo: res.pseudo };
      isGuest = false;
      enterApp();
      return;
    }
  } catch(e) { /* serveur indisponible */ }
  showPage('page-auth');
}

function enterApp() {
  const name = isGuest ? 'Invité' : currentUser.pseudo;
  document.getElementById('user-name-display').textContent = name;
  showPage('page-home');
}

// =====================================================
// NAVIGATION
// =====================================================
function goHome()          { closeModal(); showPage('page-home'); }
function startNewGame()    { closeModal(); showPage('page-game'); initGame(); }

function confirmLeave() {
  if (!gameOver && totalSeeds() < 70) {
    if (!confirm('Abandonner la partie en cours ?')) return;
  }
  showPage('page-home');
}

function confirmRestart() {
  if (!gameOver && totalSeeds() < 70) {
    if (!confirm('Abandonner la partie et en commencer une nouvelle ?')) return;
  }
  startNewGame();
}

// =====================================================
// SAUVEGARDE
// =====================================================
async function saveGame(result) {
  if (isGuest) {
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem('songo_guest')) || []; } catch(e) {}
    hist.unshift(result);
    if (hist.length > 50) hist = hist.slice(0, 50);
    localStorage.setItem('songo_guest', JSON.stringify(hist));
    return;
  }
  await apiPost(API.saveGame, {
    result:   result.result,
    winner:   result.winner,
    score_j1: result.scores[0],
    score_j2: result.scores[1],
    board:    result.board,
    reason:   result.reason,
    is_draw:  result.isDraw,
  });
}

// =====================================================
// HISTORIQUE
// =====================================================
async function loadAndRenderHistory() {
  const contentEl = document.getElementById('hist-content');
  const countEl   = document.getElementById('hist-count');
  const statsRow  = document.getElementById('stats-row');

  contentEl.innerHTML = '<div class="hist-empty">Chargement…</div>';
  statsRow.style.display = 'none';

  if (isGuest) {
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem('songo_guest')) || []; } catch(e) {}
    contentEl.innerHTML = `
      <div class="hist-guest-note">
        Connectez-vous pour sauvegarder votre historique entre les sessions.
      </div>`;
    renderHistoryCards(hist, contentEl, countEl, true);
    return;
  }

  const res = await apiGet(API.getHistory);
  if (!res.success) {
    contentEl.innerHTML = '<div class="hist-empty">Erreur lors du chargement.</div>';
    return;
  }

  const { games, stats } = res;

  if (games.length > 0) {
    document.getElementById('stat-played').textContent  = stats.played;
    document.getElementById('stat-wins').textContent    = stats.wins;
    document.getElementById('stat-losses').textContent  = stats.losses;
    document.getElementById('stat-draws').textContent   = stats.draws;
    statsRow.style.display = 'flex';
  }

  const hist = games.map(g => ({
    date:   g.played_at,
    result: g.result,
    winner: g.winner,
    scores: [g.score_j1, g.score_j2],
    board:  g.board,
    reason: g.reason,
    isDraw: g.is_draw,
  }));

  contentEl.innerHTML = '';
  renderHistoryCards(hist, contentEl, countEl, false);
}

function renderHistoryCards(hist, contentEl, countEl, guest) {
  countEl.textContent = hist.length ? `${hist.length} partie${hist.length > 1 ? 's' : ''}` : '';

  if (hist.length === 0) {
    contentEl.innerHTML += '<div class="hist-empty">Aucune partie enregistrée.<br>Jouez votre première partie !</div>';
    return;
  }

  let html = '<div class="hist-list">';
  hist.forEach(g => {
    const d       = new Date(g.date);
    const dateStr = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

    let boardHtml = '';
    if (g.board) {
      boardHtml = `
        <div class="hist-board">
          <div class="hist-board-rows">
            <div class="hist-board-row">
              <span class="hist-player-lbl">J2</span>
              ${[13,12,11,10,9,8,7].map(i=>`<div class="hist-pit-mini${g.board[i]===0?' empty':''}">${g.board[i]}</div>`).join('')}
            </div>
            <div class="hist-board-row">
              <span class="hist-player-lbl">J1</span>
              ${[0,1,2,3,4,5,6].map(i=>`<div class="hist-pit-mini${g.board[i]===0?' empty':''}">${g.board[i]}</div>`).join('')}
            </div>
          </div>
        </div>`;
    }

    html += `
      <div class="hist-card">
        <div class="hist-card-header">
          <span class="hist-card-result">${g.result}</span>
          <span class="hist-card-date">${dateStr}</span>
        </div>
        <div class="hist-card-scores">
          <span>Joueur 1 : <strong>${g.scores[0]}</strong></span>
          <span>Joueur 2 : <strong>${g.scores[1]}</strong></span>
        </div>
        ${g.reason ? `<div class="hist-card-reason">${g.reason}</div>` : ''}
        ${boardHtml}
      </div>`;
  });
  html += '</div>';
  const clearFn = guest ? 'clearGuestHistory()' : 'clearUserHistory()';
  html += `<button class="hist-clear-btn" onclick="${clearFn}">Effacer l'historique</button>`;
  contentEl.innerHTML += html;
}

async function clearGuestHistory() {
  if (!confirm("Effacer tout l'historique ?")) return;
  localStorage.removeItem('songo_guest');
  loadAndRenderHistory();
}

async function clearUserHistory() {
  if (!confirm('Effacer définitivement toutes vos parties ?')) return;
  const res = await apiPost(API.clearHistory);
  if (res.success) { showToast('Historique effacé.'); loadAndRenderHistory(); }
}

// =====================================================
// MODALE
// =====================================================
function openModal(resultData) {
  const { winner, scores: sc, reason, isDraw } = resultData;
  document.getElementById('modal-emoji').textContent = isDraw ? '🤝' : '🏆';
  document.getElementById('modal-title').textContent = isDraw ? 'Match nul !' : `Joueur ${winner} gagne !`;
  document.getElementById('modal-sub').textContent   = isDraw ? 'Les deux joueurs sont à égalité' : `Victoire du Joueur ${winner}`;
  document.getElementById('modal-scores-row').innerHTML = `
    <div class="modal-player-score">
      <div class="lbl">Joueur 1</div>
      <div class="val${winner === 1 ? ' winner' : ''}">${sc[0]}</div>
    </div>
    <div class="modal-sep">·</div>
    <div class="modal-player-score">
      <div class="lbl">Joueur 2</div>
      <div class="val${winner === 2 ? ' winner' : ''}">${sc[1]}</div>
    </div>`;
  document.getElementById('modal-reason').textContent = reason || '';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// =====================================================
// LOGIQUE DU JEU (identique à votre version XAMPP)
// =====================================================
let board, currentPlayer, scores, lastPit, gameOver;

const SEQ = {
  1: [6, 5, 4, 3, 2, 1, 0, 7, 8, 9, 10, 11, 12, 13],
  2: [13, 12, 11, 10, 9, 8, 7, 0, 1, 2, 3, 4, 5, 6]
};

function playerRange(p)        { return p === 1 ? [0, 6]  : [7, 13]; }
function opponentRange(p)      { return p === 1 ? [7, 13] : [0, 6];  }
function isInOpponentCamp(p,i) { const [os,oe]=opponentRange(p); return i>=os&&i<=oe; }
function frontierIndex(p)      { return p === 1 ? 6 : 13; }
function specialIndex(p)       { return p === 1 ? 7 : 6;  }

function initGame() {
  board=[...Array(14)].map(()=>4);
  currentPlayer=1; scores=[0,0]; lastPit=-1; gameOver=false;
  const el=document.getElementById('msg');
  el.className='msg'; el.textContent='Tour du Joueur 1';
  render();
}

function hasSeeds(p) {
  const [s,e]=playerRange(p);
  for (let i=s;i<=e;i++) if (board[i]>0) return true;
  return false;
}
function totalSeeds() { return board.reduce((a,b)=>a+b,0); }

function simulateMove(b,startIdx,p) {
  let tmp=[...b], seeds=tmp[startIdx]; tmp[startIdx]=0;
  const seq=SEQ[p]; let opSeeds=0, last=startIdx;
  const fullTours=Math.floor(seeds/13), remainder=seeds%13;

  if (fullTours===0) {
    let cur=startIdx;
    for (let i=0;i<seeds;i++) {
      let np=(seq.indexOf(cur)+1)%14;
      while (seq[np]===startIdx) np=(np+1)%14;
      cur=seq[np]; tmp[cur]++;
      if (isInOpponentCamp(p,cur)) opSeeds++;
    }
    last=cur;
  } else {
    const sp=seq.indexOf(startIdx);
    const swos=[...seq.slice(0,sp),...seq.slice(sp+1)];
    for (let t=0;t<fullTours;t++)
      for (let i=0;i<13;i++) { tmp[swos[i]]++; if (isInOpponentCamp(p,swos[i])) opSeeds++; }
    const oppSeq=seq.slice(7);
    let rem=remainder, oi=0;
    while (rem>0) { const idx=oppSeq[oi%oppSeq.length]; tmp[idx]++; opSeeds++; last=idx; rem--; oi++; }
    if (remainder===0) last=swos[swos.length-1];
  }
  return {board:tmp,last,opSeeds,fullTour:fullTours>0};
}

function getMoves(p) {
  const [s,e]=playerRange(p);
  return Array.from({length:e-s+1},(_,k)=>s+k).filter(i=>board[i]>0)
    .map(i=>{ const r=simulateMove(board,i,p); return {idx:i,seeds:board[i],opSeeds:r.opSeeds,sim:r}; });
}

function isForbidden(idx,p) {
  if (idx!==frontierIndex(p)) return false;
  return board[idx]===1||board[idx]===2;
}

function solidarityCheck(p) {
  const opp=3-p;
  if (hasSeeds(opp)) return {forced:null,end:false,strict:false};
  const moves=getMoves(p);
  if (moves.length===0) return {forced:null,end:true};
  const valid=moves.filter(m=>m.opSeeds>=7&&!isForbidden(m.idx,p));
  if (valid.length>0) return {forced:valid.map(m=>m.idx),end:false,strict:false};
  const best=moves.reduce((a,b)=>a.opSeeds>b.opSeeds?a:b);
  return {forced:[best.idx],end:false,strict:true};
}

function doCapture(b,lastIdx,p,seedsPlayed) {
  const [os,oe]=opponentRange(p), specIdx=specialIndex(p);
  let tmp=[...b], captured=0;
  if (!isInOpponentCamp(p,lastIdx)) return {board:tmp,captured:0};
  if (!tmp.slice(os,oe+1).some(v=>v>0)) return {board:tmp,captured:0};
  if (lastIdx===specIdx&&seedsPlayed>=14) {
    const tb=[...tmp]; tb[lastIdx]=0;
    if (tb.slice(os,oe+1).some(v=>v>0)) { tmp[lastIdx]=0; return {board:tmp,captured:1}; }
    return {board:tmp,captured:0};
  }
  if (lastIdx===specIdx) return {board:tmp,captured:0};
  const step=p===1?-1:1;
  let cur=lastIdx, isChain=false;
  while (true) {
    if (!isInOpponentCamp(p,cur)) break;
    const count=tmp[cur];
    if (cur===specIdx&&!isChain) break;
    if (count>=2&&count<=4) {
      const tb=[...tmp]; tb[cur]=0;
      if (!tb.slice(os,oe+1).some(v=>v>0)) break;
      captured+=count; tmp[cur]=0; cur+=step; isChain=true;
    } else break;
  }
  return {board:tmp,captured};
}

// Animation des graines (votre version originale conservée)
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function animateMove(b, startIdx, p) {
  let tmp = [...b];
  let seeds = tmp[startIdx];
  tmp[startIdx] = 0;
  const seq = SEQ[p];
  let cur = startIdx;

  for (let i = 0; i < seeds; i++) {
    let np = (seq.indexOf(cur) + 1) % 14;
    while (seq[np] === startIdx) np = (np + 1) % 14;
    cur = seq[np];
    tmp[cur]++;
    board = [...tmp];
    render();
    await sleep(800);
  }
  return { board: tmp, last: cur };
}

async function handleClick(idx) {
  if (gameOver) return;
  const [s,e]=playerRange(currentPlayer);
  if (idx<s||idx>e) { showMsg("Ce n'est pas votre camp.",'error'); return; }
  if (board[idx]===0) { showMsg('Cette case est vide.','error'); return; }

  const sol=solidarityCheck(currentPlayer);
  if (sol.end) { endGame('Fin de partie : solidarité impossible.'); return; }
  if (sol.forced&&!sol.forced.includes(idx)) { showMsg('⚠ Coup de solidarité requis.','error'); return; }

  if (isForbidden(idx,currentPlayer)) {
    if (sol.strict&&sol.forced&&sol.forced.includes(idx)) {
      scores[2-currentPlayer]+=board[idx]; board[idx]=0;
      showMsg("⚠ Coup interdit forcé : graines à l'adversaire.",'error');
      updateScoreDisplay(); nextTurn(); return;
    }
    showMsg('❌ Interdit : 1 ou 2 graines depuis la case frontière.','error'); return;
  }

  const seedsPlayed=board[idx];
  const sim = await animateMove(board, idx, currentPlayer);
  board=sim.board; lastPit=sim.last;

  const cap=doCapture(board,sim.last,currentPlayer,seedsPlayed);
  board=cap.board;
  if (cap.captured>0) {
    scores[currentPlayer-1]+=cap.captured;
    const pl=cap.captured>1?'s':'';
    showMsg(`+${cap.captured} graine${pl} capturée${pl}`,'capture');
  } else showMsg('');

  updateScoreDisplay();
  if (scores[currentPlayer-1]>=40) { endGame(`Joueur ${currentPlayer} gagne !`,true,'40 graines atteintes'); return; }
  if (totalSeeds()<10) { giveRemainingSeeds(); return; }
  nextTurn();
}

function nextTurn() {
  currentPlayer=3-currentPlayer;
  const sol=solidarityCheck(currentPlayer);
  if (sol.end) { endGame('Fin de partie : solidarité impossible.',false,'Solidarité impossible'); return; }
  if (!hasSeeds(currentPlayer)) { endGame(`Joueur ${currentPlayer} ne peut plus jouer.`,false,'Camp vide'); return; }
  render();
  if (!document.getElementById('msg').textContent) showMsg(`Tour du Joueur ${currentPlayer}`);
}

function giveRemainingSeeds() {
  for (let i=0;i<=6;i++)  { scores[0]+=board[i]; board[i]=0; }
  for (let i=7;i<=13;i++) { scores[1]+=board[i]; board[i]=0; }
  updateScoreDisplay(); render();
  if (scores[0]>=40) { endGame('Joueur 1 gagne !',true,'Moins de 10 graines au total'); return; }
  if (scores[1]>=40) { endGame('Joueur 2 gagne !',true,'Moins de 10 graines au total'); return; }
  if (scores[0]===scores[1]) { endGame('Match nul !',false,'Moins de 10 graines — égalité',true); return; }
  endGame(`Joueur ${scores[0]>scores[1]?1:2} gagne !`,true,'Moins de 10 graines au total');
}

async function endGame(msg,isWin,reason,isDraw) {
  gameOver=true;
  showMsg(msg,isWin?'win':'');
  render();
  let winner=null;
  if (!isDraw) winner=scores[0]>scores[1]?1:2;
  const resultData={
    date:new Date().toISOString(),
    result:isDraw?'Match nul':`Joueur ${winner} gagne`,
    winner, scores:[...scores], board:[...board], reason:reason||msg, isDraw:!!isDraw
  };
  await saveGame(resultData);
  if (!isGuest) showToast('Partie sauvegardée ✓');
  setTimeout(()=>openModal(resultData),350);
}

function showMsg(text,cls) {
  const el=document.getElementById('msg');
  el.className='msg'+(cls?' '+cls:''); el.textContent=text;
}
function updateScoreDisplay() {
  document.getElementById('sv1').textContent=scores[0];
  document.getElementById('sv2').textContent=scores[1];
}
function render() {
  const tr=document.getElementById('top-row'), br=document.getElementById('bot-row');
  tr.innerHTML=''; br.innerHTML=''; updateScoreDisplay();
  document.getElementById('p1row').className='player-row'+(currentPlayer===1?' active':'');
  document.getElementById('p2row').className='player-row'+(currentPlayer===2?' active':'');
  for (let i=7;i>=13;i--) tr.appendChild(makePit(i,2));
  for (let i=0;i<=6;i++)  br.appendChild(makePit(i,1));
}
function makePit(idx,owner) {
  const div=document.createElement('div'); div.className='pit';
  if (board[idx]===0) div.classList.add('empty');
  if (gameOver) div.classList.add('disabled');
  if (idx===lastPit&&!gameOver) div.classList.add('last-pit');
  const isActive=currentPlayer===owner;
  if (isActive&&!gameOver) div.classList.add('active-player');
  const lbl=document.createElement('span'); lbl.className='pit-label';
  lbl.textContent=idx<=6?`C${idx+1}`:`C${14-idx}`;
  div.textContent=board[idx]; div.appendChild(lbl);
  if (isActive&&board[idx]>0&&!gameOver) div.addEventListener('click',()=>handleClick(idx));
  else div.classList.add('disabled');
  if (idx===frontierIndex(owner)) div.classList.add('frontier');
  return div;
}

// =====================================================
// DÉMARRAGE
// =====================================================
checkSession();
