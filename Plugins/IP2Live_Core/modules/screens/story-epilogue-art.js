/** Hand-rendered epilogue paintings and a perspective-textured certificate.
 * Static architecture is cached by the story screen; only light, debris and
 * atmosphere animate. No image assets or generative artwork are required.
 */
(function () {
    const TAU = Math.PI * 2, C = { cyan: '#83ebd4', red: '#ed5273', gold: '#edce94' };
    const clamp = x => Math.max(0, Math.min(1, x));
    function poly(c, points, fill, stroke, width = 1) {
        c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
        if (fill) { c.fillStyle = fill; c.fill(); }
        if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    }
    function line(c, points, color, width = 1) {
        c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
        c.strokeStyle = color; c.lineWidth = width; c.stroke();
    }
    function gradient(c, x, y, xx, yy, colors) {
        const g = c.createLinearGradient(x, y, xx, yy);
        colors.forEach((v, i) => g.addColorStop(i / (colors.length - 1), v)); return g;
    }
    function glow(c, x, y, rx, ry, color) {
        c.save(); c.translate(x, y); c.scale(rx, ry);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, color); g.addColorStop(1, '#00000000');
        c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
    }
    function label(c, value, x, y, size = 10, color = C.cyan, align = 'left') {
        c.font = size + 'px "Oxanium-Medium", sans-serif'; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
    }
    function grain(c, points, seed = 19, alpha = .17) {
        c.save(); poly(c, points); c.clip(); c.globalAlpha *= alpha;
        const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]), x0=Math.min(...xs), y0=Math.min(...ys);
        const w=Math.max(1,Math.max(...xs)-x0), h=Math.max(1,Math.max(...ys)-y0);
        for (let i = 0; i < Math.min(4500,Math.max(45,w*h/36)); i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const x = x0 + seed / 4294967296 * w;
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const y = y0 + seed / 4294967296 * h;
            c.fillStyle = i % 3 ? '#d0e5e1' : '#00030b'; c.fillRect(x, y, i % 7 ? 1 : 8, .65);
        }
        c.restore();
    }
    function plate(c, points, colors, stroke = '#657180') {
        const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
        poly(c, points, gradient(c,Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys),colors), stroke);
        c.save(); c.clip();
        for(let y=Math.min(...ys);y<Math.max(...ys);y+=4) line(c,[[Math.min(...xs),y],[Math.max(...xs),y-8]],'#b5c6d00a',.5);
        c.restore(); grain(c, points);
    }
    function floor(c, horizon = 320, vanishing = 800, color = '#101725') {
        c.fillStyle = color; c.fillRect(0, horizon, 1280, 400);
        for (let x = -650; x < 2000; x += 150) line(c, [[vanishing + (x - vanishing) * .12, horizon], [x, 720]], '#7b8b9b25');
        for (const y of [360, 390, 431, 487, 562, 665]) line(c, [[0, y], [1280, y]], '#7b8b9b1f');
        poly(c, [[0, 720], [1280, 720], [1280, 535], [0, 535]], '#02061050');
    }
    function cabinet(c, x, y, w, h, damaged = false) {
        plate(c, [[x, y + 12], [x + 12, y], [x + w, y], [x + w, y + h], [x, y + h]], ['#384353', '#141e2d', '#080e19']);
        poly(c, [[x + w, y], [x + w + 18, y + 14], [x + w + 18, y + h - 6], [x + w, y + h]], '#080f1b', '#435266');
        for (let row = 0; row < 7; row++) {
            const yy = y + 23 + row * (h - 38) / 7;
            poly(c, [[x + 9, yy], [x + w - 9, yy], [x + w - 9, yy + 19], [x + 9, yy + 19]], '#07101c', '#3b4051');
            for (let slot = 0; slot < 6; slot++) { c.fillStyle = damaged ? '#272537' : '#a3445f'; c.fillRect(x + 17 + slot * (w - 40) / 6, yy + 6, 4, 3); }
            line(c, [[x + 12, yy + 13], [x + w - 14, yy + 13]], '#4f61762b');
        }
        if (damaged) line(c, [[x + 10, y + 39], [x + w * .6, y + 87], [x + w * .35, y + 120], [x + w - 12, y + 160]], '#050910', 6);
        for (const xx of [x + 5, x + w - 5]) line(c, [[xx, y + 13], [xx, y + h - 9]], '#b3c7ce28', 2);
        for(const yy of [y+9,y+h-8]) for(const xx of [x+10,x+w-9]) {
            c.fillStyle='#080f1c'; c.fillRect(xx-2,yy-2,4,4); line(c,[[xx-1,yy],[xx+1,yy]],'#8a9ca7',.7);
        }
    }
    function chamber(c, damaged) {
        c.fillStyle = gradient(c, 0, 0, 0, 720, ['#080b17', '#282035', '#111a29']); c.fillRect(0, 0, 1280, 720);
        glow(c, 825, 310, 470, 270, damaged ? '#ad552423' : '#c93c6533');
        floor(c);
        for (const x of [40, 188, 1055]) cabinet(c, x, 174, x === 1055 ? 149 : 116, 320, damaged);
        for (const x of [365, 970]) {
            plate(c, [[x, 78], [x + 23, 93], [x + 23, 444], [x + 5, 479], [x - 12, 456], [x - 12, 92]], ['#313345', '#161e2b']);
            line(c, [[x + 5, 109], [x + 5, 430]], damaged ? '#5c414d' : '#ae4963', 2);
        }
        for (let i = 0; i < 4; i++) line(c, [[400 + i * 30, 140], [770, 90 + i * 11], [1010, 146 + i * 20]], '#7063763b', 5);
        plate(c, [[640, 442], [814, 399], [999, 449], [831, 511]], ['#4e5360', '#162433'], '#78929b');
        plate(c, [[640, 442], [831, 511], [831, 529], [640, 460]], ['#202736', '#0b1623']);
        poly(c, [[831, 511], [999, 449], [999, 468], [831, 529]], '#0a1221', '#465765');
    }
    function core(c, broken = false) {
        plate(c, [[733, 207], [810, 166], [889, 207], [889, 428], [810, 477], [733, 428]], ['#646171', '#1a293b', '#101625'], '#9ca8b0');
        poly(c, [[810, 166], [889, 207], [889, 428], [810, 477], [829, 401], [829, 222]], '#0b162790');
        poly(c, [[733,207],[747,215],[747,417],[766,429],[733,428]], '#8a96a324');
        for(const [x,y] of [[747,215],[875,215],[747,416],[875,416],[810,181],[810,457]]) {
            c.fillStyle='#080f1c'; c.beginPath(); c.arc(x,y,3.5,0,TAU); c.fill(); line(c,[[x-2,y],[x+2,y]],'#a7a7ad',.8);
        }
        for (const dir of [-1, 1]) {
            line(c, [[810 + dir * 60, 220], [810 + dir * 60, 414], [810 + dir * 30, 435]], broken ? '#635360' : C.red, 3);
            for (let y = 235; y < 414; y += 21) line(c, [[810 + dir * 46, y], [810 + dir * 33, y + 8]], '#ad9cad55', 2);
        }
        poly(c, [[810, 225], [858, 274], [858, 351], [810, 399], [762, 351], [762, 274]], '#090e1c', '#897d92', 3);
        poly(c, [[810, 247], [844, 281], [844, 343], [810, 375], [777, 343], [777, 281]], broken ? '#1b222f' : '#59243f', broken ? '#73828f' : '#f77291', 2);
        if (broken) {
            line(c, [[811, 247], [798, 287], [826, 311], [799, 332], [811, 375]], '#020710', 7);
            line(c, [[826, 311], [841, 294], [856, 299]], '#020710', 5);
            poly(c, [[802, 456], [835, 443], [851, 459], [828, 469]], '#465564', '#7d8a8d');
        } else {
            poly(c, [[810, 268], [832, 311], [810, 356], [788, 311]], '#e9a3b2', '#fee9db');
            label(c, 'APEX', 810, 422, 14, '#d2b1bc', 'center');
        }
    }
    function operator(c, x, feet, scale = 1) {
        c.save(); c.translate(x, feet); c.scale(scale, scale);
        glow(c, 4, 7, 93, 13, '#000000b0');
        poly(c, [[-32, -58], [-7, -59], [-10, 0], [-42, 0]], '#0a101a', '#4a4355');
        poly(c, [[5, -58], [28, -61], [33, -1], [5, -1]], '#131b28', '#4a4355');
        poly(c, [[-45, -1], [-10, -1], [-6, 11], [-47, 11]], '#1c2531', '#414651');
        poly(c, [[4, 0], [35, -1], [42, 9], [4, 10]], '#1c2531', '#414651');
        plate(c, [[-26, -153], [22, -157], [46, -127], [54, -61], [19, -45], [-48, -51], [-42, -129]], ['#544054', '#241e32', '#1b2130'], '#9e6882');
        poly(c, [[-22, -145], [-44, -122], [-57, -75], [-45, -70], [-22, -111]], '#241e30', '#866077');
        plate(c, [[23, -149], [42, -134], [58, -104], [81, -112], [114, -141], [123, -132], [89, -93], [68, -85], [37, -104]], ['#604057', '#36243b'], '#a46f89');
        poly(c, [[114, -141], [128, -148], [136, -145], [125, -138], [135, -139], [139, -135], [123, -130], [115, -132]], '#c49296', '#e1bab1');
        plate(c, [[-34, -157], [-37, -185], [-22, -210], [0, -222], [23, -210], [33, -182], [21, -153], [0, -135]], ['#624159', '#292337', '#111b29'], '#ae7b91');
        poly(c, [[0, -215], [22, -204], [26, -184], [15, -157], [2, -142], [-6, -170]], '#0a1220', '#659b9d50');
        line(c, [[-22, -202], [-13, -183], [-18, -158], [0, -141]], '#997188', 1.2);
        line(c, [[-36, -154], [0, -132], [24, -153]], '#b38194', 1.5);
        for (const xx of [-32, -16, 12, 29]) line(c, [[xx, -126], [xx - 5, -55]], '#a8748b45', 1.2);
        line(c, [[-37, -88], [10, -85], [41, -91]], '#080e19', 5);
        poly(c, [[-33, -90], [-17, -89], [-17, -72], [-35, -74]], '#2e3c49', '#7f8f94');
        c.restore();
    }
    function consoleDeck(c) {
        plate(c, [[429, 437], [604, 437], [625, 458], [409, 458]], ['#536170', '#283644'], '#8aa3a7');
        plate(c, [[409, 458], [625, 458], [625, 476], [409, 476]], ['#233140', '#111b29']);
        for (const x of [438, 579]) { poly(c, [[x, 476], [x + 15, 476], [x + 13, 515], [x - 1, 515]], '#23313d', '#657784'); }
        poly(c, [[451, 310], [601, 310], [601, 428], [451, 428]], '#102c38ed', '#84d8c5', 2);
        for(let x=458;x<596;x+=12) line(c,[[x,338],[x,424]],'#80c6bd0e',.5);
        for(let y=340;y<424;y+=12) line(c,[[458,y],[596,y]],'#80c6bd12',.5);
        line(c,[[456,311],[456,318],[466,318]],'#c1ffe5',1.3);
        glow(c,524,437,90,12,'#5dffdc25');
        label(c, 'FINAL UPLINK', 466, 328, 11, '#d0faeb');
        for (let row = 0; row < 4; row++) {
            label(c, ['PUBLIC ROUTE', 'ACCESS GRANTED', 'APEX CONTROL', 'REVOKE'][row], 466, 351 + row * 20, row === 3 ? 12 : 9, row === 3 ? C.gold : '#99bdbd');
        }
        line(c, [[600, 417], [660, 417], [700, 390], [733, 390]], '#0a101b', 9);
        line(c, [[600, 417], [660, 417], [700, 390], [733, 390]], '#83abac', 3);
    }
    function rupture(c, x, y, time, scale = 1) {
        const p = clamp(time / 3.8); if (!p) return;
        c.save(); c.translate(x, y); c.scale(scale, scale);
        glow(c, 0, 0, 65 + p * 95, 80 + p * 80, '#ffc288' + Math.round((1 - p) * 120).toString(16).padStart(2, '0'));
        for (let i = 0; i < 24; i++) {
            const a = i * 2.399, radius = 9 + p * (90 + i % 5 * 12);
            const xx = Math.cos(a) * radius, yy = Math.sin(a) * radius + p * p * 135;
            c.globalAlpha = (1 - p) * .85;
            line(c, [[xx, yy], [xx - Math.cos(a) * 11, yy - Math.sin(a) * 11]], i % 3 ? '#efb878' : '#b3fff1', 1.6);
        }
        c.restore();
    }
    function finalBreach(c) { chamber(c, false); core(c); consoleDeck(c); operator(c, 300, 502, 1.25); }
    function shutdown(c) {
        chamber(c, true); core(c, true);
        for (let i = 0; i < 3; i++) {
            const x = 405 + i * 80;
            const yy=276+i*24;
            plate(c, [[x-4,yy-24],[x+55,yy-24],[x+65,yy-10],[x+65,yy+82],[x-4,yy+82]], ['#535b6b','#192635'], '#84909a');
            poly(c,[[x+55,yy-24],[x+73,yy-12],[x+73,yy+69],[x+65,yy+82],[x+65,yy-10]],'#121c2c','#5d6e80');
            for(let ring=0;ring<3;ring++) { c.beginPath(); c.ellipse(x+29,yy+12,23-ring*5,26-ring*5,0,0,TAU); c.strokeStyle=ring===2?'#293140':'#8b8a91';c.lineWidth=ring===2?4:2;c.stroke(); }
            for(let spoke=0;spoke<5;spoke++) {const a=spoke*TAU/5;line(c,[[x+29,yy+12],[x+29+Math.cos(a)*18,yy+12+Math.sin(a)*20]],'#81919c',2);}
            for(let vent=0;vent<4;vent++) line(c,[[x+8,yy+51+vent*5],[x+49,yy+51+vent*5]],'#0c1523',2);
            line(c, [[x + 28, yy+83], [x + 29, 433], [x + 60, 470]], '#171e2e', 15);
            line(c, [[x + 28, yy+83], [x + 29, 433], [x + 60, 470]], '#62717c', 6);
            poly(c,[[x+44,467],[x+74,467],[x+79,476],[x+40,476]],'#263644','#72818d');
            line(c,[[x+5,yy-12],[x+23,yy-7],[x+17,yy+13]],'#07111e',3);
        }
        for (let i = 0; i < 17; i++) {
            const x = 475 + (i * 73) % 480, y = 483 + (i * 17) % 47;
            poly(c, [[x - 7, y], [x + 8, y - 5], [x + 16, y + 3], [x + 1, y + 8]], i % 2 ? '#3f4755' : '#222b39', '#81818c50');
        }
    }
    function robotParts() {
        return [
            { x: 0, y: -122, p: [[-20,-14],[11,-18],[23,-5],[19,13],[-19,13]], color: '#647181' },
            { x: 0, y: -78, p: [[-29,-25],[21,-25],[31,14],[12,28],[-21,25],[-34,2]], color: '#39495c' },
            { x: -40, y: -77, p: [[-12,-21],[9,-24],[13,18],[0,24],[-14,8]], color: '#536273' },
            { x: 40, y: -75, p: [[-12,-23],[9,-21],[16,15],[4,25],[-11,17]], color: '#536273' },
            { x: -18, y: -25, p: [[-11,-23],[13,-21],[9,20],[-16,22]], color: '#344454' },
            { x: 17, y: -24, p: [[-11,-22],[12,-20],[18,22],[-8,22]], color: '#465567' },
            { x: -22, y: 2, p: [[-16,-6],[12,-6],[11,8],[-20,8]], color: '#526174' },
            { x: 24, y: 2, p: [[-13,-6],[13,-6],[22,8],[-12,8]], color: '#526174' },
        ];
    }
    const PARTS = robotParts();
    function robot(c, x, feet, scale, seconds, delay, reduced) {
        const p = reduced ? .9 : clamp((seconds - delay) / 2.8), blast = p > 0;
        c.save(); c.translate(x, feet); c.scale(scale, scale); glow(c, 0, 8, 100, 17, '#00000090');
        if (!blast) for (const dir of [-1, 1]) line(c, [[dir * 18, -119], [dir * 27, -62], [dir * 20, 1]], '#101826', 8);
        PARTS.forEach((part, i) => {
            const dir = (i % 2 ? -1 : 1), dx = dir * p * (32 + i * 8);
            const yy = Math.min(8 - i % 3 * 5, part.y - p * (92 + i * 7) + p * p * (280 - part.y));
            c.save(); c.translate(part.x + dx, blast ? yy : part.y); c.rotate(p * dir * (1.3 + i * .19));
            plate(c, part.p, [part.color, '#142233'], '#8d98a3');
            line(c, [[-7, -7], [6, -7], [8, 6]], '#b9d3d053');
            if (i === 0) {
                poly(c,[[-16,-5],[17,-5],[15,6],[-15,6]],'#101b2b','#9eacb7',.7);
                line(c, [[-11, 0], [12, 0]], blast ? '#312434' : C.red, 2.5);
                for(const xx of [-14,12]) line(c,[[xx,11],[xx+3,11]],'#bbcbd3',1);
            }
            if (i === 1) {
                poly(c, [[0,-12],[9,0],[0,12],[-9,0]], blast ? '#202733' : C.red, '#aea2a9');
                for(const dir of [-1,1]) for(let vent=0;vent<4;vent++) line(c,[[dir*13,-5+vent*5],[dir*23,-7+vent*5]],'#091323',1.8);
                line(c,[[-23,-21],[18,-21],[23,-15]],'#a4bac45e',1.4);
            }
            if(i>1) { line(c,[[-6,-14],[4,-14],[6,11],[-5,14]],'#b1c2c05e',1); line(c,[[-4,-10],[-2,10]],'#091524',3); }
            c.restore();
        });
        if (!reduced) rupture(c, 0, -85, Math.max(0, seconds - delay), 1);
        c.restore();
    }
    function robotCourtyard(c) {
        c.fillStyle = gradient(c, 0, 0, 0, 720, ['#080c19', '#48273e', '#141c2b']); c.fillRect(0, 0, 1280, 720);
        IP2Live.PrologueArt.elements.city(c, 731, 446, .25);
        floor(c, 420, 883, '#161a2b');
        IP2Live.PrologueArt.elements.fortress(c, 885, 147, .76, false);
        poly(c,[[809,177],[852,147],[943,147],[982,168],[1042,428],[1013,450],[757,450]],'#050c188c');
        line(c,[[874,180],[888,229],[874,278],[902,328],[890,383]],'#030812',4);
        plate(c, [[724, 449], [1009, 449], [1077, 485], [675, 485]], ['#4f4355', '#192334'], '#76667d');
        for (const x of [43, 1123]) cabinet(c, x, 289, 96, 216, true);
        line(c, [[0, 528], [1280, 528]], '#6e657c', 4);
    }
    function resident(c, x, y, s, shirt = '#5a7385') {
        c.save(); c.translate(x, y); c.scale(s, s);
        glow(c, 0, 2, 14, 3, '#07111b50');
        poly(c, [[-5,-21],[0,-20],[-1,0],[-7,0]], '#273447'); poly(c, [[1,-21],[6,-21],[7,0],[2,0]], '#273447');
        poly(c, [[-6,-46],[5,-46],[11,-33],[7,-18],[-7,-18],[-11,-33]], shirt, '#afc2bd55');
        line(c, [[-7,-40],[-14,-26]], shirt, 5); line(c, [[7,-40],[14,-26]], shirt, 5);
        c.fillStyle = '#c59387'; c.beginPath(); c.ellipse(0,-53,5,7,0,0,TAU); c.fill(); c.restore();
    }
    function reclaimed(c) {
        c.fillStyle = gradient(c, 0, 0, 0, 720, ['#152338', '#6d7879', '#d1b99d', '#324a51']); c.fillRect(0, 0, 1280, 720);
        glow(c, 890, 191, 260, 185, '#ffdeb150');
        IP2Live.PrologueArt.elements.city(c, 981, 421, 1);
        // What remains of the command tower is an unpowered, broken silhouette.
        poly(c, [[1010,385],[1004,278],[1025,271],[1022,247],[1042,261],[1060,253],[1078,288],[1084,385]], '#33414c', '#71818b');
        line(c, [[1024,300],[1042,320],[1032,348]], '#152a36', 4);
        floor(c, 423, 720, '#233640');
        poly(c, [[420,720],[1000,720],[818,440],[653,440]], '#697977', '#8c9a92');
        for (let y = 453; y < 650; y += 27) line(c, [[595 - (y - 450) * .8,y],[830 + (y - 450) * .6,y]], '#b2b5a452');
        // Restored public water has a visible basin, pressure pipe and spouts.
        plate(c, [[95,400],[278,400],[305,422],[79,422]], ['#81928c','#415b61'], '#a8b9af');
        poly(c, [[79,422],[305,422],[305,452],[79,452]], '#324850', '#829c9e');
        poly(c, [[102,407],[274,407],[287,419],[92,419]], '#80c6bf', '#a2e4d1');
        IP2Live.PrologueArt.elements.pipe(c, [[51,532],[341,532],[361,515],[361,434]], 13, true, false);
        plate(c, [[345,407],[389,407],[389,455],[345,455]], ['#617c7b','#264952'], '#8cc9b8');
        IP2Live.PrologueArt.elements.pipe(c,[[361,434],[361,401],[278,401]],9,true,false);
        label(c, 'WATER FOR ALL', 193, 438, 9, '#d6ead6', 'center');
        c.save(); c.translate(-220, 64); c.scale(.94,.94); IP2Live.PrologueArt.elements.farms(c); c.restore();
        // A public distribution pavilion, aligned with the avenue.
        plate(c, [[593,335],[833,335],[856,354],[572,354]], ['#92aaa0','#385c65'], '#a9c8b9');
        poly(c, [[583,354],[845,354],[845,428],[583,428]], '#38535d', '#88aba7');
        for (const x of [597,716,829]) poly(c, [[x,355],[x+9,355],[x+9,432],[x,432]], '#8a9e99', '#bfd2bd');
        poly(c, [[620,367],[696,367],[696,422],[620,422]], '#203d46', '#64ab9b');
        poly(c, [[736,367],[813,367],[813,422],[736,422]], '#203d46', '#64ab9b');
        label(c, 'PUBLIC COMMONS', 712, 345, 13, '#e0eed6', 'center');
        for (let i = 0; i < 9; i++) {
            const x = 625 + i * 21; poly(c, [[x,413],[x+14,413],[x+14,428],[x,428]], i%2 ? '#bc9c6e' : '#7a9f7c', '#d5cc9b50');
        }
        for (const [x,y,s,color] of [[566,491,.9,'#aa8874'],[592,499,1.1,'#668e8b'],[876,481,1,'#c2a17c'],[895,481,.7,'#7d9d91'],[322,498,1.2,'#8999a4'],[382,510,1.1,'#a38a82'],[1073,514,1.3,'#718f9d']]) resident(c,x,y,s,color);
        // Supply carts, young trees, solar roof and a celebratory communal banner.
        plate(c, [[924,477],[982,477],[982,497],[924,497]], ['#89a48b','#425f59'], '#b1c9ae');
        for (const x of [934,972]) { c.fillStyle='#172c38'; c.beginPath(); c.arc(x,501,6,0,TAU); c.fill(); }
        for (const x of [480,948]) {
            line(c, [[x,488],[x,421]], '#6d675b', 5);
            for (let i = 0; i < 6; i++) poly(c, [[x,444-i*5],[x-27+i*2,433-i*8],[x-15+i,415-i*7],[x,423-i*7],[x+25-i*3,415-i*5],[x+23-i*2,440-i*4]], '#577e6a', '#8bb08a4b');
        }
        line(c, [[493,336],[714,313],[936,336]], '#bfbb99', 1.4);
        for (let i=0;i<12;i++) poly(c, [[505+i*36,335-Math.sin(i/11*Math.PI)*21],[524+i*36,333-Math.sin(i/11*Math.PI)*21],[515+i*36,350-Math.sin(i/11*Math.PI)*21]], i%2 ? '#d9b981' : '#84c4ad');
    }
    function ambient(c, index, seconds, options) {
        const t = options.reducedMotion ? 7 : seconds;
        c.save(); c.beginPath(); c.rect(22,148,1236,399); c.clip();
        if (index === 0) {
            const p = clamp((t - .8) / 4);
            glow(c, 810, 312, 72, 125, '#82ffe6' + Math.round((.25 + p*.42)*255).toString(16).padStart(2,'0'));
            for (const dir of [-1,1]) line(c, [[810,261],[810+dir*8,292],[810-dir*5,314],[810+dir*12,339],[810,362]], '#e5fff0', 1.7);
            glow(c, 467, 337, 21, 21, '#b4ffe09c');
            if (!options.reducedMotion) rupture(c,810,312,Math.max(0,t-3.5),.65);
        } else if (index === 1) {
            const p = clamp(t / 4.5);
            c.fillStyle = '#040914' + Math.round(p * 92).toString(16).padStart(2,'0'); c.fillRect(35,170,1180,330);
            if (!options.reducedMotion) for (const [i,x] of [180,530,810,1108].entries()) rupture(c,x,305+i%2*80,Math.max(0,t-.8-i*.6),.58);
            label(c,'COMMAND NETWORK / OFFLINE',810,310,15,'#adbbc2','center');
        } else if (index === 2) {
            for (const [i,x] of [350,620,1025].entries()) robot(c,x,510,[1.3,1.6,1.15][i],t,1.1+i*.55,options.reducedMotion);
        } else {
            for (let i=0;i<9;i++) {
                const yy=410+(i*2.3+t*6)%9; line(c,[[119+i*14,yy],[130+i*14,yy]],'#c7ffe591',.8);
            }
            if (!options.reducedMotion) for (let i=0;i<5;i++) { const x=800+i*24+t*2; line(c,[[x,240+Math.sin(t+i)*2],[x+4,237],[x+8,240+Math.sin(t+i)*2]],'#c5d8ca70',1); }
        }
        for(let i=0;i<30;i++) {
            const x=(i*137.3+t*(index===3?1:3))%1280, y=180+(i*37.7-t*1.8+360)%350;
            c.fillStyle=index===3?'#ffe3ab3b':'#b6c9d72a'; c.fillRect(x,y,1.2,1.2);
        }
        if(index===1||index===2) for(let i=0;i<7;i++) {
            const x=180+i*154+Math.sin(t*.2+i)*12, y=465-((t*8+i*25)%170);
            glow(c,x,y,30+i%3*8,20,'#6b6e7f19');
        }
        c.restore();
    }
    // Precut triangle sprites avoid rebuilding Canvas clip masks on every
    // animation frame. Mapping still uses projected 3D vertices on both axes.
    function prepareCertificateTexture(texture) {
        const cells=[],w=texture.width,h=texture.height;
        for(let row=0;row<2;row++) for(let col=0;col<8;col++) {
            const uv=[[col/8,row/2],[(col+1)/8,row/2],[(col+1)/8,(row+1)/2],[col/8,(row+1)/2]];
            for(const indices of [[0,1,2],[0,2,3]]) {
                const coords=indices.map(i=>uv[i]),global=coords.map(([u,v])=>[u*w,v*h]);
                const x0=Math.floor(Math.min(...global.map(p=>p[0])))-2,y0=Math.floor(Math.min(...global.map(p=>p[1])))-2;
                const surface=document.createElement('canvas');
                surface.width=Math.ceil(Math.max(...global.map(p=>p[0]))-x0)+2;
                surface.height=Math.ceil(Math.max(...global.map(p=>p[1]))-y0)+2;
                const source=global.map(([x,y])=>[x-x0,y-y0]),center=[source.reduce((s,p)=>s+p[0],0)/3,source.reduce((s,p)=>s+p[1],0)/3];
                const expanded=source.map(p=>{const dx=p[0]-center[0],dy=p[1]-center[1],n=Math.hypot(dx,dy)||1;return[p[0]+dx/n*1.2,p[1]+dy/n*1.2];});
                const paint=surface.getContext('2d'); poly(paint,expanded);paint.clip();paint.drawImage(texture,-x0,-y0);
                cells.push({surface,source,coords});
            }
        }
        return {cells,width:w,height:h};
    }
    function drawTextureCell(c,cell,dst) {
        const [p,q,r]=cell.source,[a,b,d]=dst;
        const det=p[0]*(q[1]-r[1])+q[0]*(r[1]-p[1])+r[0]*(p[1]-q[1]);
        if(Math.abs(det)<.001)return;
        const solve=(v0,v1,v2)=>[
            (v0*(q[1]-r[1])+v1*(r[1]-p[1])+v2*(p[1]-q[1]))/det,
            (v0*(r[0]-q[0])+v1*(p[0]-r[0])+v2*(q[0]-p[0]))/det,
            (v0*(q[0]*r[1]-r[0]*q[1])+v1*(r[0]*p[1]-p[0]*r[1])+v2*(p[0]*q[1]-q[0]*p[1]))/det,
        ];
        const x=solve(a[0],b[0],d[0]),y=solve(a[1],b[1],d[1]);
        c.save();c.transform(x[0],y[0],x[1],y[1],x[2],y[2]);c.drawImage(cell.surface,0,0);c.restore();
    }
    function project(x,y,z,angle,tilt) {
        const xx=x*Math.cos(angle)+z*Math.sin(angle), zz=-x*Math.sin(angle)+z*Math.cos(angle);
        const yy=y*Math.cos(tilt)-zz*Math.sin(tilt), depth=y*Math.sin(tilt)+zz*Math.cos(tilt);
        const f=1050/(1050+depth); return [640+xx*f,342+yy*f,depth];
    }
    function drawCertificateModel(c, front, back, seconds, reducedMotion) {
        const angle=reducedMotion?-.14:seconds*TAU/19-.14, tilt=reducedMotion?-.06:Math.sin(seconds*.35)*.07-.07;
        const point=(u,v,z)=>project((u-.5)*430,(v-.5)*304,z,angle,tilt);
        glow(c,640,519,270,25,'#70e5ca2d'); glow(c,640,335,330,260,'#527e7730');
        // Only the camera-facing sheet needs texture mapping.
        const faces=Math.cos(angle)>=0?[{z:-4,t:front,back:false}]:[{z:4,t:back,back:true}];
        c.save(); c.imageSmoothingQuality='low';
        for(const face of faces) {
            const corners=[point(0,0,face.z),point(1,0,face.z),point(1,1,face.z),point(0,1,face.z)];
            poly(c,corners,'#cdb680','#e3cd9b',3);
            for(const cell of face.t.cells) drawTextureCell(c,cell,cell.coords.map(([u,v])=>point(face.back?1-u:u,v,face.z)));
            poly(c,corners,'#08141e'+Math.round((1-Math.abs(Math.cos(angle)))*65).toString(16).padStart(2,'0'),'#ffe3a2',1.5);
        }
        // Edge strips remain visible while the face turns edge-on.
        for(const [u,v,uu,vv] of [[0,0,1,0],[1,0,1,1],[1,1,0,1],[0,1,0,0]]) {
            const points=[point(u,v,-4),point(uu,vv,-4),point(uu,vv,4),point(u,v,4)];
            const edgeDepth=points.reduce((s,p)=>s+p[2],0)/4;
            if(edgeDepth<0) poly(c,points,'#bda679','#e8d4a4',.7);
        }
        c.restore();
    }
    IP2Live.EpilogueArt = {
        beats: [
            { title:'THE FINAL BREACH', subtitle:'TOP FLOOR / THE APEX COMMAND CORE', text:'At the final uplink, you turn APEX\'s own network against it. The subnet locks fall. You sever the command core from every system it controls, and the machine that kept a world in chains breaks apart.' },
            { title:'THE END OF APEX', subtitle:'EXCLUSIVE CONTROL / TERMINATED', text:'Across the facility, APEX\'s servers collapse and its hoarding mechanisms grind to a halt. Locked reservoirs open. The routes that carried everything inward now return water, food, medicine and power to the people.' },
            { title:'NO MORE GUARDIANS', subtitle:'SECURITY NETWORK / DISCONNECTED', text:'With their command link destroyed, the APEX robots overload. Their weapons fall silent; their armoured shells burst into sparks and scrap. For the first time in years, no machine stands between the people and what is theirs.' },
            { title:'WHAT BELONGS TO EVERYONE', subtitle:'NEO-GAIA / ONE YEAR LATER', text:'One year later, the people have reclaimed their world. Public taps run, gardens thrive and homes shine again. Thank you, Infiltrator. Your knowledge opened the way; together, the people made freedom last.' },
        ],
        paint(c,index) {
            c.save(); [finalBreach,shutdown,robotCourtyard,reclaimed][index](c);
            grain(c,[[0,0],[1280,0],[1280,720],[0,720]],417,.12);
            c.fillStyle=gradient(c,0,0,0,720,['#03061050','#03061000','#03061000','#030610d0']); c.fillRect(0,0,1280,720);
            c.restore();
        },
        paintAmbient: ambient,
        drawCertificateModel,
        prepareCertificateTexture,
    };
}());
