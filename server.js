const { Masterchat, stringify } = require('masterchat');
const { createCanvas, registerFont } = require('canvas');
const { GAMES } = require('./games');
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const VIDEO_ID = process.env.YOUTUBE_VIDEO_ID;
const YT_RTMP = process.env.YOUTUBE_RTMP; // rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx-xxxx
const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static('public'));

try { registerFont('./fonts/Cairo-Bold.ttf', { family: 'Cairo' }); }
catch(e) { console.log('الخط Cairo غير موجود، يستعمل الافتراضي'); }

// ضد النوم
app.get('/health', (req, res) => res.send('♾️ حي'));
app.get('/', (req, res) => res.send('Infinity Gen ♾️ 16 لعبة شغالة'));
setInterval(() => {
    if(process.env.RENDER_EXTERNAL_URL) {
        require('https').get(`https://${process.env.RENDER_EXTERNAL_URL}/health`);
    }
}, 14 * 60 * 1000);

app.listen(PORT, () => console.log(`♾️ Server شغال على ${PORT}`));

let STATE = {
    mode: 'idle', game: null, data: {},
    lobby: { host: '', players: [], startTime: 0 },
    toast: { text: '', expires: 0 },
    lastActivity: Date.now()
};

let ffmpegProcess = null;

// الرسم الرئيسي
function drawOverlay() {
    const W = 1920, H = 1080;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // هيدر ثابت
    ctx.fillStyle = '#0a0a0fE6'; ctx.fillRect(0, 0, W, 90);
    ctx.fillStyle = '#8A2BE2'; ctx.font = 'bold 45px Cairo, Arial'; ctx.textAlign = 'center';
    ctx.fillText('INFINITY GEN ♾️ | بث مباشر من قالمة', W/2, 60);

    if (STATE.mode === 'idle') drawIdleScreen(ctx, W, H);
    else if (STATE.mode === 'lobby') drawLobbyScreen(ctx, W, H);
    else if (STATE.mode === 'game' && GAMES[STATE.game]) {
        GAMES[STATE.game].renderer(ctx, W, H, STATE.data);
    }

    // التوست
    if (Date.now() < STATE.toast.expires) {
        ctx.fillStyle = '#00ff88E6'; ctx.fillRect(0, H-120, W, 80);
        ctx.fillStyle = '#000'; ctx.font = 'bold 40px Cairo';
        ctx.fillText(STATE.toast.text, W/2, H-65);
    }

    // فوتر
    ctx.fillStyle = '#1a1a1aCC'; ctx.fillRect(0, H-40, W, 40);
    ctx.fillStyle = '#888'; ctx.font = '20px Cairo';
    ctx.fillText('صنع في قالمة 🇩🇿 | Render مجاني ♾️ | 16 لعبة', W/2, H-12);

    if (!fs.existsSync('./public')) fs.mkdirSync('./public');
    fs.writeFileSync('./public/overlay.png', canvas.toBuffer('image/png'));
}

function drawIdleScreen(ctx, W, H) {
    ctx.fillStyle = '#1a1a1aCC'; ctx.fillRect(W/2-600, H/2-200, 1200, 400);
    ctx.strokeStyle = '#8A2BE2'; ctx.lineWidth = 5; ctx.strokeRect(W/2-600, H/2-200, 1200, 400);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 50px Cairo';
    ctx.fillText('16 لعبة تفاعلية + بث مباشر', W/2, H/2-80);
    ctx.font = '35px Cairo'; ctx.fillStyle = '#888';
    ctx.fillText('اكتب.start + اسم اللعبة للبدء', W/2, H/2);
    ctx.fillText('xo | مافيا | rps | تخمين | كلمة | عجلة | سؤال | كتابة', W/2, H/2+60);
    ctx.fillText('كلمات | مليون | كنز | سجن | سرعة | قاتل | بورصة | مملكة', W/2, H/2+110);
}

function drawLobbyScreen(ctx, W, H) {
    const game = GAMES[STATE.game];
    const timeLeft = 30 - Math.floor((Date.now() - STATE.lobby.startTime) / 1000);
    ctx.fillStyle = '#1a1a1aF2'; ctx.fillRect(W/2-600, 120, 1200, 850);
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 6; ctx.strokeRect(W/2-600, 120, 1200, 850);
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 60px Cairo';
    ctx.fillText(`غرفة ${game.name} ${game.emoji}`, W/2, 200);
    ctx.fillStyle = '#fff'; ctx.font = '40px Cairo';
    ctx.fillText(`الهوست: ${STATE.lobby.host} | يبدأ خلال: ${timeLeft>0?timeLeft:0}ث`, W/2, 280);
    ctx.fillText(`اللاعبين ${STATE.lobby.players.length}/${game.max} | اكتب: ادخل`, W/2, 350);
    ctx.font = '35px Cairo'; ctx.textAlign = 'right';
    STATE.lobby.players.forEach((p,i) => {
        const col = i%2, row = Math.floor(i/2);
        ctx.fillText(`${i+1}. ${p}`, W/2+450-col*500, 430+row*60);
    });
}

setInterval(drawOverlay, 1000); // 1fps كافي للبث

// البث المباشر بـ FFmpeg
function startStream() {
    if (ffmpegProcess ||!YT_RTMP) return;
    console.log('♾️ بدء البث المباشر...');

    // إنشاء فيديو أسود 24 ساعة كمصدر
    ffmpegProcess = ffmpeg()
       .input('color=c=black:s=1920x1080:r=30')
       .inputFormat('lavfi')
       .input('anullsrc=channel_layout=stereo:sample_rate=44100')
       .inputFormat('lavfi')
       .input('./public/overlay.png')
       .inputOptions(['-stream_loop -1', '-re'])
       .complexFilter([
            '[0:v][2:v] overlay=0:0:format=auto:shortest=1[out]'
        ])
       .outputOptions([
            '-map [out]', '-map 1:a',
            '-c:v libx264', '-preset ultrafast', '-tune zerolatency',
            '-pix_fmt yuv420p', '-g 60', '-keyint_min 60',
            '-b:v 2500k', '-maxrate 2500k', '-bufsize 5000k',
            '-c:a aac', '-b:a 128k', '-ar 44100',
            '-f flv'
        ])
       .output(YT_RTMP)
       .on('start', () => console.log('🔥 البث بدأ'))
       .on('error', (err) => { console.log('FFmpeg Error:', err.message); ffmpegProcess = null; })
       .on('end', () => { console.log('البث توقف'); ffmpegProcess = null; })
       .run();
}

// قارئ الشات
async function main() {
    if (!VIDEO_ID) return console.log('حط YOUTUBE_VIDEO_ID يا جلاد');
    if (YT_RTMP) setTimeout(startStream, 5000);

    const mc = await Masterchat.init(VIDEO_ID);
    mc.on('chat', (chat) => {
        const author = chat.authorName;
        const msg = stringify(chat.message).trim();
        STATE.lastActivity = Date.now();

        // بدء لعبة
        if (msg.startsWith('.start ') && STATE.mode === 'idle') {
            const cmd = msg.split(' ')[1];
            const gameKey = Object.keys(GAMES).find(k => GAMES[k].cmd === cmd);
            if (gameKey) {
                STATE.mode = 'lobby'; STATE.game = gameKey;
                STATE.data = GAMES[gameKey].init([author]);
                STATE.lobby = { host: author, players: [author], startTime: Date.now() };
                showToast(`غرفة ${GAMES[gameKey].name} فتحت`);
                setTimeout(() => startGame(), 30000);
            }
        }

        // دخول
        if (msg === 'ادخل' && STATE.mode === 'lobby') {
            if (STATE.lobby.players.length < GAMES[STATE.game].max &&!STATE.lobby.players.includes(author)) {
                STATE.lobby.players.push(author);
                showToast(`${author} دخل الغرفة`);
            }
        }

        // تمرير للعبة
        if (STATE.mode === 'game' && GAMES[STATE.game]) {
            GAMES[STATE.game].input(msg, STATE.data, author);
            // إنهاء تلقائي للعبة
            if (checkGameEnd(STATE.game, STATE.data)) {
                setTimeout(() => resetGame(), 5000);
            }
        }

        // إلغاء
        if (msg === '.stop' && author === STATE.lobby.host) resetGame();
        if (msg === 'سلام') showToast(`وعليكم السلام ${author} 🔥`);
    });

    mc.on('error', console.error);
    mc.listen();
    console.log('♾️ قارئ الشات شغال');
}

function startGame() {
    if (STATE.mode!== 'lobby') return;
    if (STATE.lobby.players.length < GAMES[STATE.game].min) {
        showToast('لاعبين غير كافيين'); resetGame(); return;
    }
    STATE.mode = 'game';
    STATE.data = GAMES[STATE.game].init(STATE.lobby.players);
    showToast(`لعبة ${GAMES[STATE.game].name} بدأت!`);
}

function resetGame() {
    STATE = { mode: 'idle', game: null, data: {}, lobby: {host:'',players:[],startTime:0}, toast: STATE.toast, lastActivity: Date.now() };
    showToast('انتهت اللعبة');
}

function showToast(text) { STATE.toast = { text, expires: Date.now() + 4000 }; }

function checkGameEnd(game, data) {
    if (game === 'xo') return data.winner!== null;
    if (game === 'rps') return data.result!== null;
    if (game === 'تخمين') return data.winner!== null;
    if (game === 'سؤال') return data.winner!== null;
    if (game === 'كنز') return data.found;
    if (game === 'عجلة') return data.result!== null;
    if (game === 'كلمات') return data.ended;
    if (game === 'مليون') return data.q >= data.questions.length;
    return false;
}

main().catch(console.error);
