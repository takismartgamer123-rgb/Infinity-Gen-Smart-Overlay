// Infinity Gen ♾️ - كل الألعاب 16 كاملة
const GAMES = {
    xo: {
        name: 'XO', min: 2, max: 2, emoji: '🗿', cmd: 'xo',
        init: (p) => ({ board: Array(9).fill(''), turn: 0, players: p, winner: null }),
        renderer: drawXO,
        input: handleXO
    },
    mafia: {
        name: 'مافيا', min: 4, max: 10, emoji: '🔪', cmd: 'مافيا',
        init: (p) => {
            const r = assignMafiaRoles(p);
            return { phase: 'night', day: 1, roles: r, alive: [...p], votes: {}, killed: null, executed: null };
        },
        renderer: drawMafia,
        input: handleMafia
    },
    rps: {
        name: 'حجر ورقة مقص', min: 1, max: 2, emoji: '✂️', cmd: 'rps',
        init: (p) => ({ p1: p[0], p2: p[1] || 'بوت', c1: null, c2: null, result: null }),
        renderer: drawRPS,
        input: handleRPS
    },
    تخمين: {
        name: 'تخمين رقم', min: 1, max: 20, emoji: '🔢', cmd: 'تخمين',
        init: () => ({ secret: Math.floor(Math.random() * 100) + 1, attempts: {}, winner: null }),
        renderer: drawGuess,
        input: handleGuess
    },
    كلمة: {
        name: 'كلمة السر', min: 2, max: 20, emoji: '📜', cmd: 'كلمة',
        init: () => {
            const w = ['قالمة', 'انفينيتي', 'جلاد', 'امبراطورية', 'بامممم', 'ريندر', 'بوت'];
            return { word: w[Math.floor(Math.random() * w.length)], revealed: [], wrong: 0, winner: null };
        },
        renderer: drawWord,
        input: handleWord
    },
    عجلة: {
        name: 'عجلة الحظ', min: 1, max: 1, emoji: '🎡', cmd: 'عجلة',
        init: () => ({ spinning: false, result: null, angle: 0, prizes: [10, 50, 100, 200, 500, 0, 1000] }),
        renderer: drawWheel,
        input: handleWheel
    },
    سؤال: {
        name: 'سؤال وجواب', min: 1, max: 20, emoji: '🎤', cmd: 'سؤال',
        init: () => {
            const q = [
                { q: 'عاصمة الجزائر؟', a: 'الجزائر' },
                { q: '5 + 5 = ؟', a: '10' },
                { q: 'لون الدم؟', a: 'احمر' },
                { q: 'كم ولاية في الجزائر؟', a: '58' },
                { q: 'اسم البوت؟', a: 'انفينيتي' }
            ][Math.floor(Math.random() * 5)];
            return { q: q.q, a: q.a, answered: [], winner: null };
        },
        renderer: drawQuiz,
        input: handleQuiz
    },
    كتابة: {
        name: 'سباق كتابة', min: 2, max: 10, emoji: '⌨️', cmd: 'كتابة',
        init: () => {
            const t = ['انفينيتي جن من قالمة', 'البوت الجلاد شغال 24 ساعة', 'بامممم يا ملك', 'ريندر مجاني 512MB'];
            return { text: t[Math.floor(Math.random() * t.length)], times: {}, started: Date.now(), finished: false };
        },
        renderer: drawTyping,
        input: handleTyping
    },
    كلمات: {
        name: 'حرب كلمات', min: 2, max: 20, emoji: '💬', cmd: 'كلمات',
        init: () => ({ words: {}, timeLeft: 60, started: Date.now(), ended: false }),
        renderer: drawWords,
        input: handleWords
    },
    مليون: {
        name: 'من سيربح النقاط', min: 1, max: 1, emoji: '💰', cmd: 'مليون',
        init: () => ({
            q: 0, score: 0,
            questions: [
                { q: 'عاصمة الجزائر؟', c: ['وهران', 'الجزائر', 'قسنطينة', 'عنابة'], a: 1 },
                { q: '2 + 2 * 2 = ؟', c: ['6', '8', '4', '2'], a: 0 },
                { q: 'لون الشمس؟', c: ['ازرق', 'اخضر', 'اصفر', 'اسود'], a: 2 },
                { q: 'مخترع البوت؟', c: ['Dandlioni', 'بوت', 'قالمة', 'ريندر'], a: 0 }
            ]
        }),
        renderer: drawMillion,
        input: handleMillion
    },
    كنز: {
        name: 'كنز قالمة', min: 1, max: 1, emoji: '💎', cmd: 'كنز',
        init: () => ({ pos: 0, treasure: Math.floor(Math.random() * 10), found: false, steps: 0 }),
        renderer: drawTreasure,
        input: handleTreasure
    },
    سجن: {
        name: 'سجن و جلاد', min: 3, max: 10, emoji: '⛓️', cmd: 'سجن',
        init: (p) => ({ warden: p[0], prisoners: p.slice(1), votes: {}, executed: null, round: 1 }),
        renderer: drawJail,
        input: handleJail
    },
    سرعة: {
        name: 'تحدي سرعة', min: 2, max: 10, emoji: '⚡', cmd: 'سرعة',
        init: () => {
            const e = ['🔥', '⚡', '💎', '👑', '🗿', '🚀', '💰'];
            return { emoji: e[Math.floor(Math.random() * e.length)], clicked: [], started: Date.now() };
        },
        renderer: drawSpeed,
        input: handleSpeed
    },
    قاتل: {
        name: 'من القاتل', min: 3, max: 10, emoji: '🗡️', cmd: 'قاتل',
        init: (p) => ({
            killer: p[Math.floor(Math.random() * p.length)],
            victim: null,
            clues: ['كان في المطبخ', 'لابس اسود', 'طويل', 'صوتو خشن', 'يحب القهوة'],
            votes: {},
            revealed: 0,
            players: [...p]
        }),
        renderer: drawKiller,
        input: handleKiller
    },
    بورصة: {
        name: 'بورصة النقاط', min: 1, max: 1, emoji: '📈', cmd: 'بورصة',
        init: () => ({ price: 100, trend: 'up', portfolio: 0, cash: 1000, history: [100] }),
        renderer: drawStock,
        input: handleStock
    },
    مملكة: {
        name: 'مملكة الجلادين', min: 5, max: 20, emoji: '👑', cmd: 'مملكة',
        init: (p) => ({ king: null, rebels: [], army: {}, votes: {}, citizens: [...p], tax: 0 }),
        renderer: drawKingdom,
        input: handleKingdom
    }
};

// ========== الرسامين الـ 16 ==========
function drawBase(ctx, W, H, title, color) {
    ctx.fillStyle = '#0a0a0fF2'; ctx.fillRect(W/2-500, H/2-350, 1000, 700);
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(W/2-500, H/2-350, 1000, 700);
    ctx.fillStyle = color; ctx.font = 'bold 55px Cairo'; ctx.textAlign = 'center';
    ctx.fillText(title, W/2, H/2-280);
}

function drawXO(ctx, W, H, data) {
    drawBase(ctx, W, H, 'XO 🗿', '#FF4500');
    const size = 180, startX = W/2 - size*1.5, startY = H/2 - size*1.5;
    ctx.lineWidth = 8; ctx.strokeStyle = '#fff';
    for(let i=1;i<3;i++){ ctx.beginPath(); ctx.moveTo(startX + i*size, startY); ctx.lineTo(startX + i*size, startY + size*3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(startX, startY + i*size); ctx.lineTo(startX + size*3, startY + i*size); ctx.stroke(); }
    ctx.font = 'bold 100px Cairo'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    data.board.forEach((c,i) => { if(!c) return; const x = startX + (i%3)*size + size/2; const y = startY + Math.floor(i/3)*size + size/2; ctx.fillStyle = c==='X'?'#FF4500':'#00BFFF'; ctx.fillText(c, x, y); });
    ctx.textBaseline = 'alphabetic';
    if(data.winner) { ctx.fillStyle = '#FFD700'; ctx.font = 'bold 60px Cairo'; ctx.fillText(`${data.winner==='تعادل'?'تعادل':data.winner+' فاز!'} 🎉`, W/2, H/2+320); }
    else { ctx.fillStyle = '#fff'; ctx.font = '40px Cairo'; ctx.fillText(`الدور: ${data.players[data.turn]}`, W/2, H/2+320); }
}

function drawMafia(ctx, W, H, data) {
    ctx.fillStyle = data.phase==='night'?'#000000F5':'#1a1a1aF5'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = data.phase==='night'?'#8B0000':'#FFD700'; ctx.font = 'bold 70px Cairo'; ctx.textAlign = 'center';
    ctx.fillText(`${data.phase==='night'?'الليل 🌙':'النهار ☀️'} - يوم ${data.day}`, W/2, H/2-150);
    ctx.font = '40px Cairo'; ctx.fillStyle = '#fff'; ctx.fillText(`الأحياء: ${data.alive.length}`, W/2, H/2-50);
    if(data.killed) { ctx.fillStyle = '#FF0000'; ctx.fillText(`قتل: ${data.killed} 💀`, W/2, H/2+20); }
    if(data.executed) { ctx.fillStyle = '#FF4500'; ctx.fillText(`أعدم: ${data.executed} ⚖️`, W/2, H/2+70); }
    ctx.font = '30px Cairo'; ctx.fillStyle = '#888'; ctx.fillText(data.phase==='night'?'.kill اسم':'صوت:.vote اسم', W/2, H/2+140);
}

function drawRPS(ctx, W, H, data) {
    drawBase(ctx, W, H, 'حجر ورقة مقص ✂️', '#FF1493');
    ctx.font = '50px Cairo'; ctx.fillStyle = '#fff';
    if(!data.c1) ctx.fillText(`${data.p1}: اختر حجر/ورقة/مقص`, W/2, H/2-50);
    else if(!data.c2) ctx.fillText(`انتظار ${data.p2}...`, W/2, H/2-50);
    else { ctx.fillText(`${data.p1}: ${data.c1} VS ${data.p2}: ${data.c2}`, W/2, H/2-50); ctx.font = '60px Cairo'; ctx.fillStyle = '#FFD700'; ctx.fillText(data.result, W/2, H/2+50); }
}

function drawGuess(ctx, W, H, data) {
    drawBase(ctx, W, H, 'تخمين رقم 1-100 🔢', '#9400D3');
    ctx.font = '45px Cairo'; ctx.fillStyle = '#fff';
    if(data.winner) { ctx.fillStyle = '#FFD700'; ctx.fillText(`فاز ${data.winner}! الرقم ${data.secret}`, W/2, H/2); }
    else { ctx.fillText('اكتب رقمك في الشات', W/2, H/2-50); const hints = Object.entries(data.attempts).slice(-3); ctx.font = '30px Cairo'; ctx.fillStyle = '#888'; hints.forEach(([p,n],i) => { ctx.fillText(`${p}: ${n} ${n>data.secret?'▼':n<data.secret?'▲':'='}`, W/2, H/2+20+i*40); }); }
}

function drawWord(ctx, W, H, data) {
    drawBase(ctx, W, H, 'كلمة السر 📜', '#00BFFF');
    ctx.font = '80px Cairo'; ctx.fillStyle = '#fff';
    const display = data.word.split('').map(c => data.revealed.includes(c)?c:'_').join(' ');
    ctx.fillText(display, W/2, H/2); ctx.font = '35px Cairo'; ctx.fillStyle = '#FF4500'; ctx.fillText(`أخطاء: ${data.wrong}/6`, W/2, H/2+100);
    if(!data.word.split('').every(c => data.revealed.includes(c)) && data.wrong >= 6) { ctx.fillStyle = '#FF0000'; ctx.fillText(`خسرت! الكلمة: ${data.word}`, W/2, H/2+160); }
    if(data.word.split('').every(c => data.revealed.includes(c))) { ctx.fillStyle = '#00ff88'; ctx.fillText(`فزت! 🎉`, W/2, H/2+160); }
}

function drawWheel(ctx, W, H, data) {
    drawBase(ctx, W, H, 'عجلة الحظ 🎡', '#FFD700');
    ctx.save(); ctx.translate(W/2, H/2); if(data.spinning) data.angle += 10; ctx.rotate(data.angle * Math.PI/180);
    const colors = ['#FF0000','#00FF00','#0000FF','#FFFF00','#FF00FF','#00FFFF','#FFA500'];
    for(let i=0;i<7;i++){ ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,150,i*Math.PI*2/7,(i+1)*Math.PI*2/7); ctx.fill(); ctx.fillStyle = '#000'; ctx.font = '25px Cairo'; ctx.textAlign = 'center'; ctx.fillText(data.prizes[i].toString(), 100*Math.cos((i+0.5)*Math.PI*2/7), 100*Math.sin((i+0.5)*Math.PI*2/7)); }
    ctx.restore(); ctx.textAlign = 'center';
    ctx.fillStyle = '#FF0000'; ctx.beginPath(); ctx.moveTo(W/2, H/2-170); ctx.lineTo(W/2-20, H/2-200); ctx.lineTo(W/2+20, H/2-200); ctx.fill();
    if(data.result!==null) { ctx.font = '60px Cairo'; ctx.fillStyle = '#FFD700'; ctx.fillText(`ربحت ${data.result} نقطة!`, W/2, H/2+250); }
    else { ctx.font = '40px Cairo'; ctx.fillStyle = '#fff'; ctx.fillText('اكتب: لف', W/2, H/2+250); }
}

function drawQuiz(ctx, W, H, data) {
    drawBase(ctx, W, H, 'سؤال وجواب 🎤', '#00ff88');
    ctx.font = '50px Cairo'; ctx.fillStyle = '#FFD700'; ctx.fillText(data.q, W/2, H/2-80);
    if(data.winner) { ctx.font = '60px Cairo'; ctx.fillStyle = '#00ff88'; ctx.fillText(`${data.winner} جاوب صح!`, W/2, H/2+50); }
    else { ctx.font = '35px Cairo'; ctx.fillStyle = '#fff'; ctx.fillText('اكتب الإجابة في الشات', W/2, H/2+50); }
}

function drawTyping(ctx, W, H, data) {
    drawBase(ctx, W, H, 'سباق كتابة ⌨️', '#8A2BE2');
    ctx.font = '45px Cairo'; ctx.fillStyle = '#FFD700'; ctx.fillText(data.text, W/2, H/2-80);
    ctx.font = '35px Cairo'; ctx.fillStyle = '#fff'; ctx.fillText('اكتب النص بأسرع وقت', W/2, H/2);
    const sorted = Object.entries(data.times).sort((a,b)=>a[1]-b[1]).slice(0,3);
    ctx.font = '30px Cairo'; ctx.fillStyle = '#00ff88'; ctx.textAlign = 'right';
    sorted.forEach(([p,t],i) => ctx.fillText(`${i+1}. ${p}: ${(t/1000).toFixed(2)}ث`, W/2+300, H/2+60+i*40));
}

function drawWords(ctx, W, H, data) {
    drawBase(ctx, W, H, 'حرب كلمات 60ث 💬', '#FF6347');
    const left = Math.max(0, data.timeLeft - Math.floor((Date.now()-data.started)/1000));
    if(left===0) data.ended = true;
    ctx.font = '70px Cairo'; ctx.fillStyle = left<10?'#FF0000':'#FFD700'; ctx.textAlign = 'center';
    ctx.fillText(`${left} ثانية`, W/2, H/2-100);
    const sorted = Object.entries(data.words).sort((a,b)=>b[1]-a[1]).slice(0,5);
    ctx.font = '35px Cairo'; ctx.textAlign = 'right';
    sorted.forEach(([p,w],i) => { ctx.fillStyle = i===0?'#FFD700':'#fff'; ctx.fillText(`${i+1}. ${p}: ${w} كلمة`, W/2+200, H/2-20+i*50); });
}

function drawMillion(ctx, W, H, data) {
    drawBase(ctx, W, H, 'من سيربح النقاط 💰', '#FFD700');
    if(data.q >= data.questions.length) { ctx.font = '60px Cairo'; ctx.fillStyle = '#00ff88'; ctx.textAlign = 'center'; ctx.fillText(`رصيدك النهائي: ${data.score} نقطة!`, W/2, H/2); return; }
    const q = data.questions[data.q]; ctx.font = '45px Cairo'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(q.q, W/2, H/2-150);
    ctx.font = '35px Cairo'; ctx.textAlign = 'right'; q.c.forEach((c,i) => ctx.fillText(`${i+1}. ${c}`, W/2+300, H/2-50+i*60));
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFD700'; ctx.fillText(`النقاط: ${data.score} | سؤال ${data.q+1}/${data.questions.length}`, W/2, H/2+200);
}

function drawTreasure(ctx, W, H, data) {
    drawBase(ctx, W, H, 'كنز قالمة 💎', '#FFD700'); ctx.font = '50px Cairo'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    let map = ''; for(let i=0;i<10;i++) map += i===data.pos?'🚶':i===data.treasure&&data.found?'💎':i===data.treasure?'❌':'⬜';
    ctx.fillText(map, W/2, H/2-50); ctx.font = '35px Cairo';
    if(data.found) { ctx.fillStyle = '#00ff88'; ctx.fillText(`لقيت الكنز في ${data.steps} خطوة!`, W/2, H/2+50); }
    else { ctx.fillStyle = '#888'; ctx.fillText('يمين / يسار / حفر', W/2, H/2+50); ctx.fillText(`الخطوات: ${data.steps}`, W/2, H/2+100); }
}

function drawJail(ctx, W, H, data) {
    drawBase(ctx, W, H, 'سجن و جلاد ⛓️', '#696969');
    ctx.font = '45px Cairo'; ctx.fillStyle = '#FF0000'; ctx.textAlign = 'center'; ctx.fillText(`الجلاد: ${data.warden}`, W/2, H/2-100);
    ctx.font = '35px Cairo'; ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText('السجناء:', W/2+200, H/2-30);
    data.prisoners.forEach((p,i) => ctx.fillText(`${i+1}. ${p}`, W/2+200, H/2+10+i*45));
    if(data.executed) { ctx.textAlign = 'center'; ctx.fillStyle = '#FF0000'; ctx.font = '50px Cairo'; ctx.fillText(`أعدم: ${data.executed} 💀`, W/2, H/2+250); }
    else { ctx.textAlign = 'center'; ctx.fillStyle = '#888'; ctx.fillText('.اعدام اسم', W/2, H/2+250); }
}

function drawSpeed(ctx, W, H, data) {
    drawBase(ctx, W, H, 'تحدي سرعة ⚡', '#FF0000');
    ctx.font = '150px Cairo'; ctx.textAlign = 'center'; ctx.fillText(data.emoji, W/2, H/2-50);
    ctx.font = '40px Cairo'; ctx.fillStyle = '#fff'; ctx.fillText('اكتب الإيموجي بسرعة!', W/2, H/2+100);
    const sorted = data.clicked.sort((a,b)=>a.time-b.time).slice(0,3);
    ctx.font = '30px Cairo'; ctx.fillStyle = '#FFD700'; ctx.textAlign = 'right';
    sorted.forEach((c,i) => ctx.fillText(`${i+1}. ${c.name}: ${(c.time/1000).toFixed(2)}ث`, W/2+300, H/2+160+i*40));
}

function drawKiller(ctx, W, H, data) {
    drawBase(ctx, W, H, 'من القاتل 🗡️', '#8B0000');
    ctx.font = '45px Cairo'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    if(!data.victim) ctx.fillText('في انتظار جريمة قتل...', W/2, H/2-80);
    else { ctx.fillStyle = '#FF0000'; ctx.fillText(`الضحية: ${data.victim} 💀`, W/2, H/2-80); ctx.font = '35px Cairo'; ctx.fillStyle = '#fff'; ctx.fillText('الأدلة:', W/2, H/2-20); data.clues.slice(0,data.revealed+1).forEach((c,i) => ctx.fillText(`${i+1}. ${c}`, W/2, H/2+20+i*45)); ctx.fillStyle = '#888'; ctx.fillText('اتهم:.اتهم اسم', W/2, H/2+180); }
    if(data.killer &&!data.victim) { ctx.font = '25px Cairo'; ctx.fillStyle = '#FF0000'; ctx.fillText('القاتل: اكتب.قتل اسم', W/2, H/2+230); }
}

function drawStock(ctx, W, H, data) {
    drawBase(ctx, W, H, 'بورصة النقاط 📈', '#00ff88');
    ctx.font = '80px Cairo'; ctx.fillStyle = data.trend==='up'?'#00ff88':'#FF0000'; ctx.textAlign = 'center';
    ctx.fillText(`${data.price} ${data.trend==='up'?'▲':'▼'}`, W/2, H/2-80);
    ctx.font = '40px Cairo'; ctx.fillStyle = '#fff'; ctx.fillText(`محفظتك: ${data.portfolio} سهم`, W/2, H/2);
    ctx.fillText(`الكاش: ${data.cash} نقطة`, W/2, H/2+50); ctx.fillStyle = '#888'; ctx.fillText('شراء / بيع', W/2, H/2+120);
    ctx.strokeStyle = data.trend==='up'?'#00ff88':'#FF0000'; ctx.lineWidth = 4; ctx.beginPath();
    data.history.slice(-10).forEach((p,i) => { const x = W/2-200+i*40; const y = H/2+250-(p-50)*2; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();
}

function drawKingdom(ctx, W, H, data) {
    drawBase(ctx, W, H, 'مملكة الجلادين 👑', '#FFD700');
    ctx.font = '50px Cairo'; ctx.fillStyle = '#FFD700'; ctx.textAlign = 'center'; ctx.fillText(`الملك: ${data.king || 'لا أحد'}`, W/2, H/2-100);
    ctx.font = '35px Cairo'; ctx.fillStyle = '#FF0000'; ctx.fillText(`المتمردين: ${data.rebels.length}`, W/2, H/2-30);
    ctx.fillStyle = '#00ff88'; ctx.fillText(`جيش الملك: ${Object.values(data.army).reduce((a,b)=>a+b,0)}`, W/2, H/2+20);
    ctx.fillStyle = '#888'; ctx.fillText('ولاء / انقلاب / جيش', W/2, H/2+100);
    ctx.font = '25px Cairo'; ctx.textAlign = 'right'; ctx.fillText(`الضرائب: ${data.tax}`, W/2+400, H/2+200);
}

// ========== منطق الألعاب الـ 16 ==========
function handleXO(msg, data, player) {
    if (data.winner) return;
    if (/^[1-9]$/.test(msg) && data.players[data.turn] === player) {
        const pos = parseInt(msg) - 1;
        if (data.board[pos] === '') {
            data.board[pos] = data.turn === 0? 'X' : 'O';
            data.winner = checkXOWinner(data.board);
            if (!data.winner) data.turn = 1 - data.turn;
        }
    }
}

function handleMafia(msg, data, player) {
    if (data.phase === 'night' && data.roles[player] === 'mafia' && msg.startsWith('.kill ')) {
        const target = msg.split(' ')[1]; if (data.alive.includes(target) && target!== player) data.killed = target;
    }
    if (data.phase === 'day' && msg.startsWith('.vote ')) {
        const target = msg.split(' ')[1]; if (data.alive.includes(target)) data.votes[player] = target;
    }
    if (data.phase === 'night' && data.killed) {
        if (data.roles[data.killed]!== 'doctor') data.alive = data.alive.filter(p => p!== data.killed);
        data.phase = 'day'; data.day++; data.votes = {}; data.killed = null;
    }
    if (data.phase === 'day' && Object.keys(data.votes).length >= data.alive.length / 2) {
        const counts = {}; Object.values(data.votes).forEach(v => counts[v] = (counts[v]||0)+1);
        const max = Math.max(...Object.values(counts));
        const executed = Object.keys(counts).find(k => counts[k] === max);
        if (executed) { data.alive = data.alive.filter(p => p!== executed); data.executed = executed; }
        data.phase = 'night'; data.votes = {};
    }
}

function handleRPS(msg, data, player) {
    if (!['حجر', 'ورقة', 'مقص'].includes(msg)) return;
    if (player === data.p1) data.c1 = msg;
    if (player === data.p2) data.c2 = msg;
    if (!data.p2 && data.c1 &&!data.c2) data.c2 = ['حجر', 'ورقة', 'مقص'][Math.floor(Math.random() * 3)];
    if (data.c1 && data.c2 &&!data.result) data.result = getRPSWinner(data.c1, data.c2, data.p1, data.p2);
}

function handleGuess(msg, data, player) {
    const n = parseInt(msg);
    if (n >= 1 && n <= 100 &&!data.winner) { data.attempts[player] = n; if (n === data.secret) data.winner = player; }
}

function handleWord(msg, data) {
    if (msg.length === 1 && data.word.includes(msg) &&!data.revealed.includes(msg)) {
        data.revealed.push(msg);
        if (data.word.split('').every(c => data.revealed.includes(c))) data.winner = 'الجميع';
    } else if (msg.length === 1) {
        data.wrong++;
    }
}

function handleWheel(msg, data) {
    if (msg === 'لف' &&!data.spinning && data.result === null) {
        data.spinning = true;
        setTimeout(() => { data.result = data.prizes[Math.floor(Math.random() * data.prizes.length)]; data.spinning = false; }, 3000);
    }
}

function handleQuiz(msg, data, player) { if (msg.trim() === data.a &&!data.winner) data.winner = player; }

function handleTyping(msg, data, player) { if (msg === data.text &&!data.times[player]) { data.times[player] = Date.now() - data.started; if (Object.keys(data.times).length >= 2) data.finished = true; } }

function handleWords(msg, data, player) { if (!data.ended) data.words[player] = (data.words[player] || 0) + msg.trim().split(/\s+/).filter(w=>w).length; }

function handleMillion(msg, data) { if (/^[1-4]$/.test(msg) && data.q < data.questions.length) { if (parseInt(msg) - 1 === data.questions[data.q].a) data.score += 100 * (data.q + 1); data.q++; } }

function handleTreasure(msg, data) {
    if (data.found) return;
    if (msg === 'يمين' && data.pos < 9) { data.pos++; data.steps++; }
    if (msg === 'يسار' && data.pos > 0) { data.pos--; data.steps++; }
    if (msg === 'حفر' && data.pos === data.treasure) data.found = true;
}

function handleJail(msg, data, player) {
    if (msg.startsWith('.اعدام ') && player === data.warden &&!data.executed) {
        const target = msg.split(' ')[1];
        if (data.prisoners.includes(target)) { data.executed = target; data.prisoners = data.prisoners.filter(p => p!== target); }
    }
}

function handleSpeed(msg, data, player) { if (msg === data.emoji &&!data.clicked.find(c => c.name === player)) data.clicked.push({ name: player, time: Date.now() - data.started }); }

function handleKiller(msg, data, player) {
    if (msg.startsWith('.قتل ') && player === data.killer &&!data.victim) {
        const target = msg.split(' ')[1]; if (data.players.includes(target) && target!== data.killer) { data.victim = target; data.revealed = 1; }
    }
    if (msg.startsWith('.اتهم ') && data.victim) { data.votes[player] = msg.split(' ')[1]; if (Object.keys(data.votes).length >= data.players.length - 2) data.revealed++; }
}

function handleStock(msg, data) {
    if (msg === 'شراء' && data.cash >= data.price) { data.portfolio++; data.cash -= data.price; data.price += Math.floor(Math.random()*10)+1; }
    if (msg === 'بيع' && data.portfolio > 0) { data.portfolio--; data.cash += data.price; data.price -= Math.floor(Math.random()*10)+1; }
    data.price = Math.max(10, data.price); data.history.push(data.price); if(data.history.length > 20) data.history.shift();
    data.trend = data.price >= data.history[data.history.length-2]? 'up' : 'down';
}

function handleKingdom(msg, data, player) {
    if (msg === 'ولاء' &&!data.king && data.citizens.includes(player)) data.king = player;
    if (msg === 'انقلاب' &&!data.rebels.includes(player) && player!== data.king) data.rebels.push(player);
    if (msg === 'جيش' && player === data.king) { data.army[player] = (data.army[player] || 0) + 1; data.tax += 10; }
    if (msg === 'ضريبة' && player === data.king) { data.tax += 50; }
    if (data.king && data.rebels.length > (data.army[data.king] || 0)) {
        data.king = null; data.rebels = []; data.army = {}; data.tax = 0;
    }
}

// ========== دوال مساعدة ==========
function checkXOWinner(b) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let [a,c,d] of lines) if (b[a] && b[a]===b[c] && b[a]===b[d]) return b[a];
    return b.includes('')? null : 'تعادل';
}

function assignMafiaRoles(players) {
    const shuffled = [...players].sort(() => 0.5 - Math.random());
    const roles = {};
    roles[shuffled[0]] = 'mafia';
    if (shuffled.length > 6) roles[shuffled[1]] = 'mafia';
    if (shuffled.length > 4) roles[shuffled[shuffled.length-1]] = 'doctor';
    shuffled.forEach(p => { if(!roles[p]) roles[p] = 'villager'; });
    return roles;
}

function getRPSWinner(c1, c2, p1, p2) {
    if (c1 === c2) return 'تعادل';
    if ((c1==='حجر'&&c2==='مقص')||(c1==='ورقة'&&c2==='حجر')||(c1==='مقص'&&c2==='ورقة'))     return `${p2} فاز!`;
}

module.exports = { GAMES };
