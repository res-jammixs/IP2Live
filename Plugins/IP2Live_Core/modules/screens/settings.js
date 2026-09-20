/**
 * IP2Live — Settings Menu + Modern Key Bindings UI
 * @file Plugins/IP2Live_Core/modules/screens/settings.js
 *
 * Modern cyan / magenta / yellow interface inspired by:
 * - Infiltrator Name Input
 * - Gameplay Pause Menu
 *
 * Main Settings changes:
 * - Bottom BACK row removed
 * - Compact clickable back-arrow added to upper-left of panel
 * - SFX / Music controls include arrows, segmented meter and percentage
 * - Existing settings behavior and persistence retained
 *
 * Key Bindings:
 * - Existing IP2LiveKeyboardMenu logic is preserved
 * - Only its presentation is modernized
 */


const IP2LiveSettingsTheme = {
    cyan: '#00F0FF',
    red: '#FF003C',
    yellow: '#FFE600',

    easeOutCubic(t) {
        const n = Math.max(
            0,
            Math.min(
                1,
                t
            )
        );

        return 1 -
            Math.pow(
                1 - n,
                3
            );
    },

    traceBeveledRect(
        ctx,
        x,
        y,
        w,
        h,
        cut
    ) {
        ctx.beginPath();

        ctx.moveTo(
            x + cut,
            y
        );

        ctx.lineTo(
            x + w - cut,
            y
        );

        ctx.lineTo(
            x + w,
            y + cut
        );

        ctx.lineTo(
            x + w,
            y + h - cut
        );

        ctx.lineTo(
            x + w - cut,
            y + h
        );

        ctx.lineTo(
            x + cut,
            y + h
        );

        ctx.lineTo(
            x,
            y + h - cut
        );

        ctx.lineTo(
            x,
            y + cut
        );

        ctx.closePath();
    },

    drawEdgePlate(
        ctx,
        x,
        y,
        w,
        h,
        slant,
        accent
    ) {
        const isDanger =
            accent === this.red;

        const isWarning =
            accent === this.yellow;

        const bright =
            isDanger
                ? 'rgba(255,72,119,0.96)'
                : (
                    isWarning
                        ? 'rgba(255,250,116,0.98)'
                        : 'rgba(82,250,255,0.96)'
                );

        const mid =
            isDanger
                ? 'rgba(255,0,60,0.82)'
                : (
                    isWarning
                        ? 'rgba(255,224,0,0.90)'
                        : 'rgba(0,184,211,0.84)'
                );

        const dark =
            isDanger
                ? 'rgba(74,0,31,0.96)'
                : (
                    isWarning
                        ? 'rgba(91,72,0,0.96)'
                        : 'rgba(0,52,77,0.96)'
                );

        const skew =
            Math.min(
                slant,
                w * 0.2
            );

        ctx.save();

        /*
         * Rear depth.
         */
        ctx.beginPath();

        ctx.moveTo(
            x + skew + 2,
            y + 2
        );

        ctx.lineTo(
            x + w + 2,
            y + 2
        );

        ctx.lineTo(
            x + w - skew + 2,
            y + h + 2
        );

        ctx.lineTo(
            x + 2,
            y + h + 2
        );

        ctx.closePath();

        ctx.fillStyle =
            'rgba(0,0,8,0.76)';

        ctx.fill();

        /*
         * Main armor plate.
         */
        ctx.beginPath();

        ctx.moveTo(
            x + skew,
            y
        );

        ctx.lineTo(
            x + w,
            y
        );

        ctx.lineTo(
            x + w - skew,
            y + h
        );

        ctx.lineTo(
            x,
            y + h
        );

        ctx.closePath();

        const grad =
            ctx.createLinearGradient(
                x,
                y,
                x + w,
                y + h
            );

        grad.addColorStop(
            0,
            bright
        );

        grad.addColorStop(
            0.36,
            mid
        );

        grad.addColorStop(
            1,
            dark
        );

        ctx.fillStyle =
            grad;

        ctx.fill();

        ctx.strokeStyle =
            'rgba(255,255,255,0.28)';

        ctx.lineWidth =
            0.65;

        ctx.stroke();

        ctx.restore();
    },

    drawBevelFacets(
        ctx,
        x,
        y,
        w,
        h,
        cut,
        depth,
        accent
    ) {
        const isDanger =
            accent === this.red;

        const bright =
            isDanger
                ? 'rgba(255,112,151,0.38)'
                : 'rgba(157,251,255,0.42)';

        const face =
            isDanger
                ? 'rgba(255,0,60,0.24)'
                : 'rgba(0,240,255,0.22)';

        const side =
            isDanger
                ? 'rgba(106,0,35,0.44)'
                : 'rgba(0,75,104,0.44)';

        const shadow =
            isDanger
                ? 'rgba(38,0,17,0.72)'
                : 'rgba(0,12,25,0.78)';

        const d =
            Math.max(
                1,
                Math.min(
                    depth,
                    cut * 0.48,
                    h * 0.18
                )
            );

        ctx.save();

        /*
         * Top bevel.
         */
        const topFace =
            ctx.createLinearGradient(
                0,
                y,
                0,
                y + d
            );

        topFace.addColorStop(
            0,
            bright
        );

        topFace.addColorStop(
            0.36,
            face
        );

        topFace.addColorStop(
            1,
            'rgba(0,0,0,0.08)'
        );

        ctx.beginPath();

        ctx.moveTo(
            x + cut,
            y
        );

        ctx.lineTo(
            x + w - cut,
            y
        );

        ctx.lineTo(
            x + w - cut - d,
            y + d
        );

        ctx.lineTo(
            x + cut + d,
            y + d
        );

        ctx.closePath();

        ctx.fillStyle =
            topFace;

        ctx.fill();

        /*
         * Right bevel.
         */
        ctx.beginPath();

        ctx.moveTo(
            x + w - cut,
            y
        );

        ctx.lineTo(
            x + w,
            y + cut
        );

        ctx.lineTo(
            x + w,
            y + h - cut
        );

        ctx.lineTo(
            x + w - cut,
            y + h
        );

        ctx.lineTo(
            x + w - cut - d,
            y + h - d
        );

        ctx.lineTo(
            x + w - d,
            y + h - cut - d
        );

        ctx.lineTo(
            x + w - d,
            y + cut + d
        );

        ctx.lineTo(
            x + w - cut - d,
            y + d
        );

        ctx.closePath();

        const rightFace =
            ctx.createLinearGradient(
                x + w - d,
                0,
                x + w,
                0
            );

        rightFace.addColorStop(
            0,
            face
        );

        rightFace.addColorStop(
            1,
            side
        );

        ctx.fillStyle =
            rightFace;

        ctx.fill();

        /*
         * Bottom bevel.
         */
        ctx.beginPath();

        ctx.moveTo(
            x + w - cut,
            y + h
        );

        ctx.lineTo(
            x + cut,
            y + h
        );

        ctx.lineTo(
            x + cut + d,
            y + h - d
        );

        ctx.lineTo(
            x + w - cut - d,
            y + h - d
        );

        ctx.closePath();

        const bottomFace =
            ctx.createLinearGradient(
                0,
                y + h - d,
                0,
                y + h
            );

        bottomFace.addColorStop(
            0,
            side
        );

        bottomFace.addColorStop(
            1,
            shadow
        );

        ctx.fillStyle =
            bottomFace;

        ctx.fill();

        /*
         * Left bevel.
         */
        ctx.beginPath();

        ctx.moveTo(
            x + cut,
            y + h
        );

        ctx.lineTo(
            x,
            y + h - cut
        );

        ctx.lineTo(
            x,
            y + cut
        );

        ctx.lineTo(
            x + cut,
            y
        );

        ctx.lineTo(
            x + cut + d,
            y + d
        );

        ctx.lineTo(
            x + d,
            y + cut + d
        );

        ctx.lineTo(
            x + d,
            y + h - cut - d
        );

        ctx.lineTo(
            x + cut + d,
            y + h - d
        );

        ctx.closePath();

        const leftFace =
            ctx.createLinearGradient(
                x,
                0,
                x + d,
                0
            );

        leftFace.addColorStop(
            0,
            side
        );

        leftFace.addColorStop(
            1,
            'rgba(255,255,255,0.035)'
        );

        ctx.fillStyle =
            leftFace;

        ctx.fill();

        /*
         * Inner edge.
         */
        this.traceBeveledRect(
            ctx,

            x + d,
            y + d,

            w - d * 2,
            h - d * 2,

            Math.max(
                2,
                cut - d
            )
        );

        ctx.strokeStyle =
            isDanger
                ? 'rgba(255,169,190,0.15)'
                : 'rgba(198,252,255,0.17)';

        ctx.lineWidth =
            Math.max(
                1,
                d * 0.2
            );

        ctx.stroke();

        ctx.restore();
    },

    drawBackdrop(
        ctx,
        cW,
        cH,
        bgFx,
        scale,
        scanlineOffset
    ) {
        /*
         * Original background image.
         */
        if (
            bgFx &&
            IP2Live.Assets &&
            IP2Live.Assets.bgImage
        ) {
            bgFx.drawBg(
                ctx,
                IP2Live.Assets.bgImage,
                cW,
                cH
            );

            if (
                typeof bgFx.drawParticles ===
                'function'
            ) {
                bgFx.drawParticles(
                    ctx,
                    scale
                );
            }
        } else {
            ctx.fillStyle =
                '#020816';

            ctx.fillRect(
                0,
                0,
                cW,
                cH
            );
        }

        /*
         * Dark blue glass overlay.
         */
        const wash =
            ctx.createLinearGradient(
                0,
                0,
                0,
                cH
            );

        wash.addColorStop(
            0,
            'rgba(0,7,22,0.54)'
        );

        wash.addColorStop(
            0.52,
            'rgba(0,5,15,0.66)'
        );

        wash.addColorStop(
            1,
            'rgba(2,2,12,0.80)'
        );

        ctx.fillStyle =
            wash;

        ctx.fillRect(
            0,
            0,
            cW,
            cH
        );

        /*
         * Vignette.
         */
        const vignette =
            ctx.createRadialGradient(
                cW * 0.5,
                cH * 0.46,
                Math.min(
                    cW,
                    cH
                ) * 0.12,

                cW * 0.5,
                cH * 0.46,
                Math.max(
                    cW,
                    cH
                ) * 0.68
            );

        vignette.addColorStop(
            0,
            'rgba(0,10,20,0.01)'
        );

        vignette.addColorStop(
            0.62,
            'rgba(0,4,12,0.10)'
        );

        vignette.addColorStop(
            1,
            'rgba(0,1,7,0.55)'
        );

        ctx.fillStyle =
            vignette;

        ctx.fillRect(
            0,
            0,
            cW,
            cH
        );

        /*
         * Scan lines.
         */
        ctx.save();

        ctx.globalAlpha =
            0.05;

        ctx.fillStyle =
            '#000000';

        const sy =
            Math.max(
                1,
                scale
            );

        const offset =
            Number(
                scanlineOffset ||
                0
            ) *
            sy;

        for (
            let y = offset;
            y < cH;
            y += 4 * sy
        ) {
            ctx.fillRect(
                0,
                y,
                cW,
                Math.max(
                    1,
                    1.2 * sy
                )
            );
        }

        ctx.restore();
    },

    drawPanel(
        ctx,
        x,
        y,
        w,
        h,
        s,
        tick
    ) {
        const cut =
            14 * s;

        /*
         * Magenta rear chassis.
         */
        this.traceBeveledRect(
            ctx,

            x + 8 * s,
            y + 10 * s,

            w,
            h,
            cut
        );

        ctx.fillStyle =
            'rgba(0,0,8,0.74)';

        ctx.shadowColor =
            'rgba(0,0,0,0.92)';

        ctx.shadowBlur =
            28 * s;

        ctx.fill();

        ctx.shadowBlur =
            0;

        ctx.strokeStyle =
            'rgba(255,0,60,0.27)';

        ctx.lineWidth =
            Math.max(
                1,
                1.1 * s
            );

        ctx.stroke();

        /*
         * Cyan offset chassis.
         */
        this.traceBeveledRect(
            ctx,

            x - 5 * s,
            y + 5 * s,

            w,
            h,
            cut
        );

        ctx.fillStyle =
            'rgba(1,18,31,0.52)';

        ctx.fill();

        ctx.strokeStyle =
            'rgba(0,240,255,0.18)';

        ctx.stroke();

        /*
         * Main face.
         */
        this.traceBeveledRect(
            ctx,
            x,
            y,
            w,
            h,
            cut
        );

        const shell =
            ctx.createLinearGradient(
                x,
                y,
                x + w,
                y + h
            );

        shell.addColorStop(
            0,
            'rgba(5,24,43,0.988)'
        );

        shell.addColorStop(
            0.45,
            'rgba(2,10,25,0.988)'
        );

        shell.addColorStop(
            0.78,
            'rgba(3,12,27,0.988)'
        );

        shell.addColorStop(
            1,
            'rgba(26,3,24,0.965)'
        );

        ctx.fillStyle =
            shell;

        ctx.shadowColor =
            'rgba(0,240,255,0.40)';

        ctx.shadowBlur =
            15 * s;

        ctx.fill();

        ctx.shadowBlur =
            0;

        /*
         * Interior scan effects.
         */
        ctx.save();

        this.traceBeveledRect(
            ctx,
            x,
            y,
            w,
            h,
            cut
        );

        ctx.clip();

        for (
            let py = y + 3 * s;
            py < y + h;
            py += 5 * s
        ) {
            ctx.fillStyle =
                'rgba(177,238,255,0.018)';

            ctx.fillRect(
                x,
                py,
                w,
                Math.max(
                    1,
                    0.55 * s
                )
            );
        }

        for (
            let px = x + 24 * s;
            px < x + w;
            px += 34 * s
        ) {
            ctx.strokeStyle =
                'rgba(0,240,255,0.028)';

            ctx.lineWidth =
                Math.max(
                    1,
                    0.5 * s
                );

            ctx.beginPath();

            ctx.moveTo(
                px,
                y
            );

            ctx.lineTo(
                px - 27 * s,
                y + h
            );

            ctx.stroke();
        }

        /*
         * Animated scanner.
         */
        const scanY =
            y -
            26 * s +
            (
                (
                    (tick || 0) *
                    1.15
                ) %
                (
                    h +
                    52 * s
                )
            );

        const scan =
            ctx.createLinearGradient(
                0,
                scanY - 18 * s,
                0,
                scanY + 18 * s
            );

        scan.addColorStop(
            0,
            'rgba(0,240,255,0)'
        );

        scan.addColorStop(
            0.5,
            'rgba(0,240,255,0.055)'
        );

        scan.addColorStop(
            1,
            'rgba(0,240,255,0)'
        );

        ctx.fillStyle =
            scan;

        ctx.fillRect(
            x,
            scanY - 18 * s,
            w,
            36 * s
        );

        ctx.restore();

        /*
         * Main outer cyan frame.
         */
        this.traceBeveledRect(
            ctx,
            x,
            y,
            w,
            h,
            cut
        );

        ctx.strokeStyle =
            'rgba(0,240,255,0.88)';

        ctx.lineWidth =
            Math.max(
                1,
                1.25 * s
            );

        ctx.shadowColor =
            'rgba(0,240,255,0.54)';

        ctx.shadowBlur =
            8 * s;

        ctx.stroke();

        ctx.shadowBlur =
            0;

        this.drawBevelFacets(
            ctx,
            x,
            y,
            w,
            h,
            cut,
            4.8 * s,
            this.cyan
        );

        /*
         * Inner glass frame.
         */
        this.traceBeveledRect(
            ctx,

            x + 5 * s,
            y + 5 * s,

            w - 10 * s,
            h - 10 * s,

            Math.max(
                3 * s,
                cut - 4 * s
            )
        );

        ctx.strokeStyle =
            'rgba(166,239,255,0.12)';

        ctx.lineWidth =
            Math.max(
                1,
                0.7 * s
            );

        ctx.stroke();

        /*
         * Top armor.
         */
        this.drawEdgePlate(
            ctx,
            x + 36 * s,
            y - 1.6 * s,
            58 * s,
            3.4 * s,
            5 * s,
            this.cyan
        );

        this.drawEdgePlate(
            ctx,
            x + w * 0.35,
            y - 1.6 * s,
            w * 0.30,
            3.4 * s,
            6 * s,
            this.cyan
        );

        this.drawEdgePlate(
            ctx,
            x + w - 93 * s,
            y - 1.6 * s,
            57 * s,
            3.4 * s,
            5 * s,
            this.cyan
        );

        /*
         * Bottom armor.
         */
        this.drawEdgePlate(
            ctx,
            x + 34 * s,
            y + h - 1.6 * s,
            65 * s,
            3.6 * s,
            5 * s,
            this.red
        );

        this.drawEdgePlate(
            ctx,
            x + w * 0.33,
            y + h - 1.6 * s,
            w * 0.40,
            3.6 * s,
            7 * s,
            this.cyan
        );
    },

    drawSectionRail(
        ctx,
        x,
        y,
        w,
        h,
        s
    ) {
        this.drawEdgePlate(
            ctx,
            x,
            y,
            w,
            h,
            7 * s,
            this.cyan
        );

        this.drawEdgePlate(
            ctx,
            x,
            y - 0.4 * s,
            w * 0.17,
            h * 0.65,
            5 * s,
            this.red
        );

        this.drawEdgePlate(
            ctx,
            x + w * 0.56,
            y - 0.5 * s,
            w * 0.09,
            h * 0.72,
            4 * s,
            this.cyan
        );
    },

    drawBackIcon(
        ctx,
        x,
        y,
        size,
        s,
        active
    ) {
        const cut =
            6 * s;

        ctx.save();

        /*
         * Rear depth.
         */
        this.traceBeveledRect(
            ctx,
            x + 3 * s,
            y + 4 * s,
            size,
            size,
            cut
        );

        ctx.fillStyle =
            'rgba(0,0,8,0.72)';

        ctx.fill();

        /*
         * Button face.
         */
        this.traceBeveledRect(
            ctx,
            x,
            y,
            size,
            size,
            cut
        );

        const bg =
            ctx.createLinearGradient(
                x,
                y,
                x + size,
                y + size
            );

        if (
            active
        ) {
            bg.addColorStop(
                0,
                'rgba(39,37,11,0.98)'
            );

            bg.addColorStop(
                0.55,
                'rgba(8,18,22,0.98)'
            );

            bg.addColorStop(
                1,
                'rgba(2,10,18,0.98)'
            );
        } else {
            bg.addColorStop(
                0,
                'rgba(4,22,34,0.96)'
            );

            bg.addColorStop(
                1,
                'rgba(2,9,18,0.98)'
            );
        }

        ctx.fillStyle =
            bg;

        ctx.fill();

        ctx.strokeStyle =
            active
                ? this.yellow
                : 'rgba(0,240,255,0.72)';

        ctx.lineWidth =
            Math.max(
                1,
                (
                    active
                        ? 1.7
                        : 1.1
                ) *
                s
            );

        ctx.shadowColor =
            active
                ? this.yellow
                : this.cyan;

        ctx.shadowBlur =
            active
                ? 10 * s
                : 4 * s;

        ctx.stroke();

        ctx.shadowBlur =
            0;

        this.drawBevelFacets(
            ctx,
            x,
            y,
            size,
            size,
            cut,
            2.6 * s,
            this.cyan
        );

        /*
         * Small Persona-like edge accent.
         */
        if (
            active
        ) {
            this.drawEdgePlate(
                ctx,
                x - 3 * s,
                y + 6 * s,
                7 * s,
                size - 12 * s,
                2 * s,
                this.yellow
            );
        }

        /*
         * Left arrow icon.
         */
        const cx =
            x +
            size *
            0.51;

        const cy =
            y +
            size *
            0.50;

        const arrow =
            8 * s;

        ctx.beginPath();

        ctx.moveTo(
            cx + arrow * 0.45,
            cy - arrow
        );

        ctx.lineTo(
            cx - arrow * 0.55,
            cy
        );

        ctx.lineTo(
            cx + arrow * 0.45,
            cy + arrow
        );

        ctx.moveTo(
            cx - arrow * 0.48,
            cy
        );

        ctx.lineTo(
            cx + arrow,
            cy
        );

        ctx.strokeStyle =
            active
                ? '#FFE600'
                : '#D7FBFF';

        ctx.lineWidth =
            Math.max(
                1,
                2.2 * s
            );

        ctx.lineCap =
            'square';

        ctx.lineJoin =
            'miter';

        ctx.stroke();

        ctx.restore();
    },

    drawMenuButton(
        ctx,
        options
    ) {
        const {
            x,
            y,
            w,
            h,
            s,
            font,
            label,
            subtitle,
            active,
            danger,
            disabled,
            tick
        } =
            options;

        const accent =
            danger
                ? this.red
                : this.cyan;

        const activeAccent =
            danger
                ? this.red
                : this.yellow;

        const cut =
            9 * s;

        ctx.save();

        /*
         * Depth.
         */
        this.traceBeveledRect(
            ctx,

            x + 4 * s,
            y + 5 * s,

            w,
            h,
            cut
        );

        ctx.fillStyle =
            'rgba(0,0,6,0.72)';

        ctx.fill();

        ctx.strokeStyle =
            danger
                ? 'rgba(255,0,60,0.18)'
                : 'rgba(0,240,255,0.18)';

        ctx.lineWidth =
            Math.max(
                1,
                0.8 * s
            );

        ctx.stroke();

        /*
         * Main button face.
         */
        this.traceBeveledRect(
            ctx,
            x,
            y,
            w,
            h,
            cut
        );

        const base =
            ctx.createLinearGradient(
                x,
                y,
                x + w,
                y + h
            );

        if (
            danger &&
            active
        ) {
            base.addColorStop(
                0,
                'rgba(78,4,28,0.99)'
            );

            base.addColorStop(
                0.55,
                'rgba(18,6,20,0.99)'
            );

            base.addColorStop(
                1,
                'rgba(18,2,14,0.99)'
            );
        } else if (
            active
        ) {
            base.addColorStop(
                0,
                'rgba(26,30,17,0.99)'
            );

            base.addColorStop(
                0.46,
                'rgba(7,20,24,0.99)'
            );

            base.addColorStop(
                1,
                'rgba(2,11,20,0.99)'
            );
        } else {
            base.addColorStop(
                0,
                'rgba(4,17,31,0.98)'
            );

            base.addColorStop(
                0.55,
                'rgba(3,9,20,0.98)'
            );

            base.addColorStop(
                1,
                danger
                    ? 'rgba(17,2,13,0.98)'
                    : 'rgba(2,13,23,0.98)'
            );
        }

        ctx.fillStyle =
            base;

        ctx.fill();

        /*
         * Animated highlight.
         */
        if (
            active &&
            !disabled
        ) {
            ctx.save();

            this.traceBeveledRect(
                ctx,
                x,
                y,
                w,
                h,
                cut
            );

            ctx.clip();

            const sweepX =
                x -
                42 * s +
                (
                    (
                        (tick || 0) *
                        2.7
                    ) %
                    (
                        w +
                        84 * s
                    )
                );

            const glow =
                ctx.createLinearGradient(
                    sweepX,
                    y,
                    sweepX + 80 * s,
                    y
                );

            glow.addColorStop(
                0,
                'rgba(255,255,255,0)'
            );

            glow.addColorStop(
                0.5,
                danger
                    ? 'rgba(255,0,60,0.11)'
                    : 'rgba(255,230,0,0.09)'
            );

            glow.addColorStop(
                1,
                'rgba(255,255,255,0)'
            );

            ctx.fillStyle =
                glow;

            ctx.fillRect(
                sweepX,
                y,
                80 * s,
                h
            );

            ctx.restore();
        }

        /*
         * Border.
         */
        this.traceBeveledRect(
            ctx,
            x,
            y,
            w,
            h,
            cut
        );

        ctx.strokeStyle =
            active
                ? activeAccent
                : (
                    danger
                        ? 'rgba(255,0,60,0.58)'
                        : 'rgba(0,240,255,0.55)'
                );

        ctx.lineWidth =
            Math.max(
                1,
                (
                    active
                        ? 1.7
                        : 1.0
                ) *
                s
            );

        ctx.shadowColor =
            active
                ? activeAccent
                : accent;

        ctx.shadowBlur =
            active
                ? 11 * s
                : 3 * s;

        ctx.globalAlpha =
            disabled
                ? 0.42
                : 1;

        ctx.stroke();

        ctx.shadowBlur =
            0;

        ctx.globalAlpha =
            1;

        this.drawBevelFacets(
            ctx,
            x,
            y,
            w,
            h,
            cut,
            (
                active
                    ? 3.2
                    : 2.4
            ) *
            s,
            accent
        );

        /*
         * Active side blade.
         */
        if (
            active &&
            !disabled
        ) {
            this.drawEdgePlate(
                ctx,

                x - 5 * s,
                y + 7 * s,

                12 * s,
                h - 14 * s,

                3 * s,
                activeAccent
            );
        }

        /*
         * Bottom energy rail.
         */
        const railAccent =
            active
                ? activeAccent
                : accent;

        this.drawEdgePlate(
            ctx,

            x +
            (
                active
                    ? 10
                    : 18
            ) *
            s,

            y +
            h -
            3.8 *
            s,

            w -
            (
                active
                    ? 20
                    : 36
            ) *
            s,

            (
                active
                    ? 2.8
                    : 2.2
            ) *
            s,

            4 * s,

            railAccent
        );

        /*
         * Label.
         */
        ctx.textAlign =
            'left';

        ctx.textBaseline =
            'middle';

        ctx.font =
            'bold ' +
            Math.round(
                (
                    subtitle
                        ? 14
                        : 15
                ) *
                s
            ) +
            'px ' +
            font;

        ctx.fillStyle =
            disabled
                ? 'rgba(225,237,242,0.42)'
                : '#F7FCFF';

        ctx.shadowColor =
            active
                ? activeAccent
                : 'transparent';

        ctx.shadowBlur =
            active
                ? 5 * s
                : 0;

        ctx.fillText(
            label,
            x + 24 * s,
            y +
            h *
            (
                subtitle
                    ? 0.38
                    : 0.52
            )
        );

        ctx.shadowBlur =
            0;

        /*
         * Subtitle.
         */
        if (
            subtitle
        ) {
            ctx.font =
                Math.round(
                    7.5 * s
                ) +
                'px ' +
                font;

            ctx.fillStyle =
                disabled
                    ? 'rgba(160,190,200,0.30)'
                    : (
                        active
                            ? (
                                danger
                                    ? 'rgba(255,145,172,0.88)'
                                    : 'rgba(210,250,255,0.88)'
                            )
                            : 'rgba(150,205,218,0.60)'
                    );

            ctx.fillText(
                subtitle,
                x + 24 * s,
                y + h * 0.69
            );
        }

        ctx.restore();
    },
};


/* =========================================================
 * MAIN SETTINGS SCREEN
 * ========================================================= */

class IP2LiveSettingsMenu extends Scene.Base {
    constructor() {
        super(true);
    }

    initialize() {
        /*
         * BACK is no longer part of this array.
         * It is now a standalone icon in the upper-left.
         */
        this.menuItems = [
            'KEY BINDINGS',
            'SFX VOLUME',
            'MUSIC VOLUME',
            'LANGUAGE [EN]',
        ];

        this.selectedIndex =
            0;

        this.hoverIndex =
            -1;

        this.hoverBack =
            false;

        this.backButtonRect =
            null;

        this.animTick =
            0;

        this.scanlineOffset =
            0;

        this.adjustingVolumeType =
            null;

        this.sfxVolume =
            this._readSfxVolumePercent();

        this.musicVolume =
            this._readMusicVolumePercent();

        this._applySfxVolumeSetting();

        this._applyMusicVolumeSetting();

        this.bgFx =
            IP2Live.BgFx.create();

        this.buttonRects =
            [];

        this.volumeHitTargets =
            [];

        this.fadeIn =
            0;
    }

    async load() {
        if (
            !IP2Live.Assets.bgImage ||
            !IP2Live.Assets.oxaniumMediumLoaded
        ) {
            await IP2Live.Assets.loadAll();
        }

        const cW =
            Common.Platform.ctx.canvas.width;

        const cH =
            Common.Platform.ctx.canvas.height;

        this.bgFx.seed(
            cW,
            cH
        );

        this.loading =
            false;

        Manager.Stack.requestPaintHUD =
            true;
    }

    onKeyPressed(key) {
        /*
         * While volume adjustment mode is active,
         * Enter or Esc closes adjustment mode.
         */
        if (
            this.adjustingVolumeType
        ) {
            if (
                Data.Keyboards.checkActionMenu(
                    key
                ) ||
                Data.Keyboards.checkCancelMenu(
                    key
                )
            ) {
                this.adjustingVolumeType =
                    null;

                try {
                    Data.Systems.soundConfirmation.playSound();
                } catch (error) {}

                Manager.Stack.requestPaintHUD =
                    true;
            }

            return true;
        }

        if (
            Data.Keyboards.checkActionMenu(
                key
            )
        ) {
            this._confirmSelection();

            return true;
        }

        /*
         * ESC still behaves as Back.
         */
        if (
            Data.Keyboards.checkCancelMenu(
                key
            )
        ) {
            this._resume();

            return true;
        }

        return true;
    }

    onKeyPressedAndRepeat(key) {
        /*
         * Volume adjustment.
         */
        if (
            this.adjustingVolumeType
        ) {
            const isLeft =
                (
                    Data.Keyboards.menuControls &&
                    Data.Keyboards.menuControls.Left
                )
                    ? Data.Keyboards.isKeyEqual(
                        key,
                        Data.Keyboards.menuControls.Left
                    )
                    : (
                        key === 37 ||
                        key === 65
                    );

            const isRight =
                (
                    Data.Keyboards.menuControls &&
                    Data.Keyboards.menuControls.Right
                )
                    ? Data.Keyboards.isKeyEqual(
                        key,
                        Data.Keyboards.menuControls.Right
                    )
                    : (
                        key === 39 ||
                        key === 68
                    );

            if (
                isLeft
            ) {
                this._nudgeVolume(
                    this.adjustingVolumeType,
                    -10
                );
            } else if (
                isRight
            ) {
                this._nudgeVolume(
                    this.adjustingVolumeType,
                    10
                );
            }

            return true;
        }

        /*
         * Main menu navigation.
         */
        const prev =
            this.selectedIndex;

        if (
            Data.Keyboards.isKeyEqual(
                key,
                Data.Keyboards.menuControls.Up
            )
        ) {
            this.selectedIndex =
                (
                    this.selectedIndex -
                    1 +
                    this.menuItems.length
                ) %
                this.menuItems.length;
        } else if (
            Data.Keyboards.isKeyEqual(
                key,
                Data.Keyboards.menuControls.Down
            )
        ) {
            this.selectedIndex =
                (
                    this.selectedIndex +
                    1
                ) %
                this.menuItems.length;
        }

        if (
            this.selectedIndex !==
            prev
        ) {
            this.hoverIndex =
                -1;

            this.hoverBack =
                false;

            try {
                Data.Systems.soundCursor.playSound();
            } catch (error) {}

            Manager.Stack.requestPaintHUD =
                true;
        }

        return true;
    }

    onMouseMove(
        x,
        y
    ) {
        /*
         * Top-left Back icon.
         */
        const overBack =
            this._isBackButtonAt(
                x,
                y
            );

        if (
            overBack !==
            this.hoverBack
        ) {
            this.hoverBack =
                overBack;

            if (
                overBack
            ) {
                this.hoverIndex =
                    -1;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            Manager.Stack.requestPaintHUD =
                true;
        }

        if (
            overBack
        ) {
            return true;
        }

        const newHover =
            this._getButtonAt(
                x,
                y
            );

        if (
            newHover !==
            this.hoverIndex
        ) {
            this.hoverIndex =
                newHover;

            if (
                newHover >= 0 &&
                newHover !==
                    this.selectedIndex
            ) {
                this.selectedIndex =
                    newHover;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            Manager.Stack.requestPaintHUD =
                true;
        }

        return true;
    }

    onMouseUp(
        x,
        y
    ) {
        /*
         * Upper-left Back icon.
         */
        if (
            this._isBackButtonAt(
                x,
                y
            )
        ) {
            this._resume();

            return true;
        }

        /*
         * Volume interaction takes priority.
         */
        const volumeHit =
            this._getVolumeHitAt(
                x,
                y
            );

        if (
            volumeHit
        ) {
            this.selectedIndex =
                volumeHit.index;

            this.adjustingVolumeType =
                volumeHit.type;

            if (
                volumeHit.action ===
                'decrease'
            ) {
                this._nudgeVolume(
                    volumeHit.type,
                    -10
                );
            } else if (
                volumeHit.action ===
                'increase'
            ) {
                this._nudgeVolume(
                    volumeHit.type,
                    10
                );
            } else if (
                volumeHit.action ===
                'bar'
            ) {
                const pct =
                    (
                        (
                            x -
                            volumeHit.x
                        ) /
                        volumeHit.w
                    ) *
                    100;

                this._setVolumePercent(
                    volumeHit.type,

                    Math.round(
                        pct /
                        5
                    ) *
                    5
                );

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}

                Manager.Stack.requestPaintHUD =
                    true;
            }

            return true;
        }

        /*
         * Regular Settings rows.
         */
        const idx =
            this._getButtonAt(
                x,
                y
            );

        if (
            idx >= 0
        ) {
            if (
                idx !==
                this.selectedIndex
            ) {
                this.selectedIndex =
                    idx;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            this._confirmSelection();
        }

        return true;
    }

    _isBackButtonAt(
        x,
        y
    ) {
        const r =
            this.backButtonRect;

        return !!(
            r &&
            x >= r.x &&
            x <= r.x + r.w &&
            y >= r.y &&
            y <= r.y + r.h
        );
    }

    _getButtonAt(
        x,
        y
    ) {
        for (
            let i = 0;
            i < this.buttonRects.length;
            i++
        ) {
            const r =
                this.buttonRects[i];

            if (
                x >= r.x &&
                x <= r.x + r.w &&
                y >= r.y &&
                y <= r.y + r.h
            ) {
                return i;
            }
        }

        return -1;
    }

    _getVolumeHitAt(
        x,
        y
    ) {
        for (
            let i = 0;
            i < this.volumeHitTargets.length;
            i++
        ) {
            const r =
                this.volumeHitTargets[i];

            if (
                x >= r.x &&
                x <= r.x + r.w &&
                y >= r.y &&
                y <= r.y + r.h
            ) {
                return r;
            }
        }

        return null;
    }

    _confirmSelection() {
        const volumeType =
            this._volumeTypeForIndex(
                this.selectedIndex
            );

        /*
         * Enter on volume row toggles adjustment mode.
         */
        if (
            volumeType
        ) {
            if (
                !this.adjustingVolumeType
            ) {
                this.adjustingVolumeType =
                    volumeType;
            } else {
                this.adjustingVolumeType =
                    null;
            }

            try {
                Data.Systems.soundConfirmation.playSound();
            } catch (error) {}

            Manager.Stack.requestPaintHUD =
                true;

            return;
        }

        /*
         * Language currently informational only.
         */
        if (
            this.selectedIndex ===
            3
        ) {
            try {
                if (
                    Data.Systems.soundImpossible
                ) {
                    Data.Systems.soundImpossible.playSound();
                } else {
                    Data.Systems.soundCancel.playSound();
                }
            } catch (error) {}

            return;
        }

        try {
            Data.Systems.soundConfirmation.playSound();
        } catch (error) {}

        this._executeAction(
            this.selectedIndex
        );
    }

    _resume() {
        try {
            Data.Systems.soundCancel.playSound();
        } catch (error) {}

        Manager.Stack.pop();
    }

    _executeAction(idx) {
        /*
         * Key Bindings.
         */
        if (
            idx === 0
        ) {
            /*
             * Apply the modern skin in case the
             * keyboard module loaded after settings.js.
             */
            if (
                IP2Live._modernizeKeyboardMenuUI
            ) {
                IP2Live._modernizeKeyboardMenuUI();
            }

            const KeyboardMenuClass =
                window.IP2LiveKeyboardMenu;

            if (
                KeyboardMenuClass
            ) {
                Manager.Stack.push(
                    new KeyboardMenuClass()
                );
            }
        }
    }

    _volumeTypeForIndex(index) {
        if (
            index === 1
        ) {
            return 'sfx';
        }

        if (
            index === 2
        ) {
            return 'music';
        }

        return null;
    }

    _volumeForType(type) {
        return type === 'music'
            ? this.musicVolume
            : this.sfxVolume;
    }

    _readSfxVolumePercent() {
        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.sfxVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.sfxVolume
                    )
                ) *
                100
            );
        }

        if (
            IP2Live.SoundFX &&
            typeof IP2Live.SoundFX.getMasterVolume ===
                'function'
        ) {
            return Math.round(
                IP2Live.SoundFX.getMasterVolume() *
                100
            );
        }

        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.masterVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.masterVolume
                    )
                ) *
                100
            );
        }

        return 100;
    }

    _readMusicVolumePercent() {
        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.musicVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.musicVolume
                    )
                ) *
                100
            );
        }

        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.masterVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.masterVolume
                    )
                ) *
                100
            );
        }

        if (
            IP2Live.MusicManager &&
            typeof IP2Live.MusicManager.getVolume ===
                'function'
        ) {
            return Math.round(
                IP2Live.MusicManager.getVolume() *
                100
            );
        }

        return 100;
    }

    _nudgeVolume(
        type,
        amount
    ) {
        this._setVolumePercent(
            type,

            this._volumeForType(
                type
            ) +
            amount
        );

        try {
            Data.Systems.soundCursor.playSound();
        } catch (error) {}

        Manager.Stack.requestPaintHUD =
            true;
    }

    _setVolumePercent(
        type,
        value
    ) {
        const next =
            Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        value
                    )
                )
            );

        if (
            type === 'music'
        ) {
            this.musicVolume =
                next;

            this._applyMusicVolumeSetting();

            this._saveAudioSettings();

            return;
        }

        this.sfxVolume =
            next;

        this._applySfxVolumeSetting();

        this._saveAudioSettings();
    }

    _applySfxVolumeSetting() {
        const volume =
            this.sfxVolume /
            100;

        IP2Live.sfxVolume =
            volume;

        if (
            IP2Live.SoundFX &&
            typeof IP2Live.SoundFX.setMasterVolume ===
                'function'
        ) {
            IP2Live.SoundFX.setMasterVolume(
                volume
            );
        }
    }

    _applyMusicVolumeSetting() {
        const volume =
            this.musicVolume /
            100;

        IP2Live.musicVolume =
            volume;

        if (
            IP2Live.MusicManager &&
            typeof IP2Live.MusicManager.setVolume ===
                'function'
        ) {
            IP2Live.MusicManager.setVolume(
                volume
            );
        }
    }

    _saveAudioSettings() {
        try {
            if (
                typeof localStorage ===
                'undefined'
            ) {
                return false;
            }

            localStorage.setItem(
                'IP2Live.audio-settings.v1',

                JSON.stringify({
                    musicVolume:
                        this.musicVolume /
                        100,

                    sfxVolume:
                        this.sfxVolume /
                        100,
                })
            );

            return true;
        } catch (error) {
            console.warn(
                '[IP2Live] Audio settings could not be saved:',
                error
            );

            return false;
        }
    }

    update() {
        this.animTick++;

        this.scanlineOffset =
            (
                this.scanlineOffset +
                0.5
            ) %
            4;

        this.fadeIn =
            Math.min(
                1,
                this.fadeIn +
                0.07
            );

        if (
            this.bgFx &&
            typeof this.bgFx.update ===
                'function'
        ) {
            this.bgFx.update(
                this.animTick
            );
        }

        if (
            this.animTick %
                2 ===
                0 ||
            this.fadeIn <
                1
        ) {
            Manager.Stack.requestPaintHUD =
                true;
        }
    }

    draw3D() {
        Manager.GL.renderer.clear();
    }

    _drawVolumeControl(
        ctx,
        x,
        y,
        w,
        h,
        s,
        font,
        index,
        type,
        value,
        active,
        adjusting
    ) {
        const pct =
            Math.max(
                0,
                Math.min(
                    100,
                    value
                )
            );

        const arrowW =
            31 * s;

        const gap =
            8 * s;

        const pctW =
            54 * s;

        const barX =
            x +
            arrowW +
            gap;

        const barW =
            w -
            arrowW * 2 -
            gap * 3 -
            pctW;

        const rightX =
            barX +
            barW +
            gap;

        const pctX =
            rightX +
            arrowW +
            gap;

        const centerY =
            y +
            h / 2;

        const accent =
            active
                ? IP2LiveSettingsTheme.yellow
                : IP2LiveSettingsTheme.cyan;

        ctx.save();

        /*
         * Arrow button helper.
         */
        const drawArrow =
            (
                ax,
                dir
            ) => {
                IP2LiveSettingsTheme.traceBeveledRect(
                    ctx,
                    ax,
                    y,
                    arrowW,
                    h,
                    5 * s
                );

                ctx.fillStyle =
                    adjusting
                        ? 'rgba(255,230,0,0.13)'
                        : (
                            active
                                ? 'rgba(255,230,0,0.08)'
                                : 'rgba(0,240,255,0.045)'
                        );

                ctx.fill();

                ctx.strokeStyle =
                    adjusting
                        ? '#FFFFFF'
                        : accent;

                ctx.lineWidth =
                    Math.max(
                        1,
                        (
                            adjusting
                                ? 1.5
                                : 1.0
                        ) *
                        s
                    );

                ctx.stroke();

                ctx.beginPath();

                if (
                    dir < 0
                ) {
                    ctx.moveTo(
                        ax +
                        arrowW *
                        0.62,

                        centerY -
                        6 * s
                    );

                    ctx.lineTo(
                        ax +
                        arrowW *
                        0.38,

                        centerY
                    );

                    ctx.lineTo(
                        ax +
                        arrowW *
                        0.62,

                        centerY +
                        6 * s
                    );
                } else {
                    ctx.moveTo(
                        ax +
                        arrowW *
                        0.38,

                        centerY -
                        6 * s
                    );

                    ctx.lineTo(
                        ax +
                        arrowW *
                        0.62,

                        centerY
                    );

                    ctx.lineTo(
                        ax +
                        arrowW *
                        0.38,

                        centerY +
                        6 * s
                    );
                }

                ctx.strokeStyle =
                    adjusting
                        ? '#FFFFFF'
                        : accent;

                ctx.lineWidth =
                    Math.max(
                        1,
                        2 * s
                    );

                ctx.stroke();
            };

        /*
         * Left arrow.
         */
        drawArrow(
            x,
            -1
        );

        /*
         * Right arrow.
         */
        drawArrow(
            rightX,
            1
        );

        /*
         * Meter frame.
         */
        const barH =
            16 * s;

        const barY =
            centerY -
            barH / 2;

        IP2LiveSettingsTheme.traceBeveledRect(
            ctx,
            barX,
            barY,
            barW,
            barH,
            4 * s
        );

        ctx.fillStyle =
            'rgba(1,7,17,0.94)';

        ctx.fill();

        ctx.strokeStyle =
            adjusting
                ? '#FFFFFF'
                : (
                    active
                        ? 'rgba(255,230,0,0.92)'
                        : 'rgba(0,240,255,0.62)'
                );

        ctx.lineWidth =
            Math.max(
                1,
                1.0 * s
            );

        ctx.stroke();

        /*
         * Meter fill.
         */
        const innerPad =
            3 * s;

        const fillX =
            barX +
            innerPad;

        const fillY =
            barY +
            innerPad;

        const fillWTotal =
            Math.max(
                1,
                barW -
                innerPad * 2
            );

        const fillH =
            Math.max(
                1,
                barH -
                innerPad * 2
            );

        const fillW =
            fillWTotal *
            pct /
            100;

        const meterGrad =
            ctx.createLinearGradient(
                fillX,
                fillY,
                fillX + fillWTotal,
                fillY
            );

        meterGrad.addColorStop(
            0,
            '#00F0FF'
        );

        meterGrad.addColorStop(
            0.72,
            '#FFE600'
        );

        meterGrad.addColorStop(
            1,
            '#FF315F'
        );

        ctx.fillStyle =
            meterGrad;

        ctx.fillRect(
            fillX,
            fillY,
            Math.max(
                0,
                fillW
            ),
            fillH
        );

        /*
         * Meter divisions.
         */
        for (
            let i = 1;
            i < 10;
            i++
        ) {
            const sx =
                fillX +
                fillWTotal *
                i /
                10;

            ctx.strokeStyle =
                'rgba(0,3,12,0.78)';

            ctx.lineWidth =
                Math.max(
                    1,
                    1.2 * s
                );

            ctx.beginPath();

            ctx.moveTo(
                sx,
                fillY
            );

            ctx.lineTo(
                sx,
                fillY +
                fillH
            );

            ctx.stroke();
        }

        /*
         * Percentage display.
         */
        IP2LiveSettingsTheme.traceBeveledRect(
            ctx,
            pctX,
            y,
            pctW,
            h,
            5 * s
        );

        ctx.fillStyle =
            active
                ? 'rgba(255,230,0,0.08)'
                : 'rgba(0,240,255,0.045)';

        ctx.fill();

        ctx.strokeStyle =
            adjusting
                ? '#FFFFFF'
                : accent;

        ctx.lineWidth =
            Math.max(
                1,
                1.0 * s
            );

        ctx.stroke();

        ctx.font =
            'bold ' +
            Math.round(
                11 * s
            ) +
            'px ' +
            font;

        ctx.textAlign =
            'center';

        ctx.textBaseline =
            'middle';

        ctx.fillStyle =
            adjusting
                ? '#FFFFFF'
                : (
                    active
                        ? '#FFE600'
                        : '#DFFAFF'
                );

        ctx.fillText(
            pct + '%',
            pctX +
            pctW /
            2,
            centerY +
            0.5 * s
        );

        /*
         * Hitboxes.
         */
        this.volumeHitTargets.push({
            index,
            type,
            action:
                'decrease',

            x,
            y,
            w:
                arrowW,
            h,
        });

        this.volumeHitTargets.push({
            index,
            type,
            action:
                'bar',

            x:
                barX,

            y:
                barY -
                6 * s,

            w:
                barW,

            h:
                barH +
                12 * s,
        });

        this.volumeHitTargets.push({
            index,
            type,
            action:
                'increase',

            x:
                rightX,

            y,

            w:
                arrowW,

            h,
        });

        ctx.restore();
    }

    drawHUD() {
        const ctx =
            Common.Platform.ctx;

        const cW =
            ctx.canvas.width;

        const cH =
            ctx.canvas.height;

        const s =
            Math.max(
                0.72,
                Math.min(
                    cW / 1280,
                    cH / 720
                )
            );

        const font =
            IP2Live.Assets &&
            IP2Live.Assets.oxaniumMediumLoaded
                ? 'Oxanium-Medium'
                : 'monospace';

        const easeIn =
            IP2LiveSettingsTheme.easeOutCubic(
                this.fadeIn
            );

        /*
         * Smaller panel because the bottom Back row
         * has been removed.
         */
        const panelW =
            540 * s;

        const panelH =
            410 * s;

        const x =
            (
                cW -
                panelW
            ) /
            2;

        const baseY =
            (
                cH -
                panelH
            ) /
            2;

        const y =
            baseY +
            (
                1 -
                easeIn
            ) *
            18 *
            s;

        ctx.save();

        /*
         * Background.
         */
        IP2LiveSettingsTheme.drawBackdrop(
            ctx,
            cW,
            cH,
            this.bgFx,
            s,
            this.scanlineOffset
        );

        ctx.globalAlpha =
            easeIn;

        /*
         * Main panel.
         */
        IP2LiveSettingsTheme.drawPanel(
            ctx,
            x,
            y,
            panelW,
            panelH,
            s,
            this.animTick
        );

        /*
         * =================================================
         * TOP-LEFT BACK ICON
         * =================================================
         */
        const backSize =
            34 * s;

        const backX =
            x +
            20 * s;

        const backY =
            y +
            19 * s;

        this.backButtonRect = {
            x:
                backX,

            y:
                backY,

            w:
                backSize,

            h:
                backSize,
        };

        IP2LiveSettingsTheme.drawBackIcon(
            ctx,
            backX,
            backY,
            backSize,
            s,
            this.hoverBack
        );

        /*
         * Title.
         */
        ctx.textAlign =
            'center';

        ctx.textBaseline =
            'middle';

        ctx.font =
            'bold ' +
            Math.round(
                25 * s
            ) +
            'px ' +
            font;

        ctx.fillStyle =
            '#FFFFFF';

        ctx.shadowColor =
            'rgba(0,240,255,0.24)';

        ctx.shadowBlur =
            5 * s;

        ctx.fillText(
            'SETTINGS',
            x +
            panelW /
            2,
            y +
            43 * s
        );

        ctx.shadowBlur =
            0;

        /*
         * Header divider.
         */
        IP2LiveSettingsTheme.drawSectionRail(
            ctx,

            x +
            34 * s,

            y +
            64 * s,

            panelW -
            68 * s,

            4 * s,

            s
        );

        /*
         * Reset hitboxes every frame.
         */
        this.buttonRects =
            [];

        this.volumeHitTargets =
            [];

        const bx =
            x +
            38 * s;

        const bw =
            panelW -
            76 * s;

        const normalH =
            58 * s;

        const volumeH =
            72 * s;

        let by =
            y +
            88 * s;

        for (
            let i = 0;
            i < this.menuItems.length;
            i++
        ) {
            const type =
                this._volumeTypeForIndex(
                    i
                );

            const rowH =
                type
                    ? volumeH
                    : normalH;

            const isActive =
                i ===
                    this.selectedIndex ||
                i ===
                    this.hoverIndex;

            const disabled =
                i === 3;

            let subtitle =
                '';

            if (
                i === 0
            ) {
                subtitle =
                    'CUSTOMIZE KEYBOARD CONTROLS';
            } else if (
                type
            ) {
                subtitle =
                    this.adjustingVolumeType ===
                    type
                        ? 'LEFT / RIGHT TO ADJUST'
                        : 'ENTER OR CLICK TO ADJUST';
            } else if (
                i === 3
            ) {
                subtitle =
                    'CURRENT LANGUAGE';
            }

            IP2LiveSettingsTheme.drawMenuButton(
                ctx,
                {
                    x:
                        bx,

                    y:
                        by,

                    w:
                        bw,

                    h:
                        rowH,

                    s,

                    font,

                    label:
                        this.menuItems[i],

                    subtitle,

                    active:
                        isActive,

                    danger:
                        false,

                    disabled,

                    tick:
                        this.animTick,
                }
            );

            this.buttonRects.push({
                x:
                    bx,

                y:
                    by,

                w:
                    bw,

                h:
                    rowH,
            });

            /*
             * Volume UI.
             */
            if (
                type
            ) {
                const meterW =
                    250 * s;

                const meterH =
                    28 * s;

                this._drawVolumeControl(
                    ctx,

                    bx +
                    bw -
                    meterW -
                    18 * s,

                    by +
                    14 * s,

                    meterW,
                    meterH,

                    s,
                    font,

                    i,

                    type,

                    this._volumeForType(
                        type
                    ),

                    isActive,

                    this.adjustingVolumeType ===
                        type
                );
            }

            by +=
                rowH +
                11 * s;
        }

        ctx.restore();
    }
}


/*
 * Expose Settings class.
 */
window.IP2LiveSettingsMenu =
    IP2LiveSettingsMenu;


/* =========================================================
 * MODERN KEY BINDINGS SKIN
 * =========================================================
 *
 * This wraps the project's existing IP2LiveKeyboardMenu.
 * It does NOT replace the original rebinding logic.
 */

function IP2LiveModernizeKeyboardMenuUI() {
    const OriginalKeyboardMenu =
        window.IP2LiveKeyboardMenu;

    if (
        !OriginalKeyboardMenu ||
        OriginalKeyboardMenu.__ip2liveModernSkinApplied
    ) {
        return false;
    }

    class IP2LiveModernKeyboardMenu extends OriginalKeyboardMenu {
        _ip2liveEnsureModernState() {
            if (
                this._ip2liveModernReady
            ) {
                return;
            }

            this._ip2liveModernReady =
                true;

            this._ip2liveModernFade =
                0;

            this._ip2liveModernScan =
                0;

            this._ip2liveModernBgFx =
                this.bgFx ||
                (
                    IP2Live.BgFx
                        ? IP2Live.BgFx.create()
                        : null
                );

            if (
                this._ip2liveModernBgFx &&
                Common &&
                Common.Platform &&
                Common.Platform.ctx
            ) {
                try {
                    this._ip2liveModernBgFx.seed(
                        Common.Platform.ctx.canvas.width,
                        Common.Platform.ctx.canvas.height
                    );
                } catch (error) {}
            }
        }

        update() {
            this._ip2liveEnsureModernState();

            /*
             * Preserve original keyboard-menu update.
             */
            const originalUpdate =
                OriginalKeyboardMenu.prototype.update;

            if (
                typeof originalUpdate ===
                'function'
            ) {
                originalUpdate.call(
                    this
                );
            }

            this._ip2liveModernFade =
                Math.min(
                    1,
                    this._ip2liveModernFade +
                    0.07
                );

            this._ip2liveModernScan =
                (
                    this._ip2liveModernScan +
                    0.5
                ) %
                4;

            if (
                this._ip2liveModernBgFx &&
                this._ip2liveModernBgFx !==
                    this.bgFx &&
                typeof this._ip2liveModernBgFx.update ===
                    'function'
            ) {
                this._ip2liveModernBgFx.update(
                    this.animTick ||
                    0
                );
            }

            if (
                Manager &&
                Manager.Stack
            ) {
                Manager.Stack.requestPaintHUD =
                    true;
            }
        }

        _ip2liveSelectedIndex() {
            if (
                Number.isInteger(
                    this.selectedIndex
                )
            ) {
                return this.selectedIndex;
            }

            if (
                Number.isInteger(
                    this.index
                )
            ) {
                return this.index;
            }

            if (
                Number.isInteger(
                    this.currentIndex
                )
            ) {
                return this.currentIndex;
            }

            if (
                this.windowChoicesMain
            ) {
                if (
                    Number.isInteger(
                        this.windowChoicesMain.currentSelectedIndex
                    )
                ) {
                    return this.windowChoicesMain.currentSelectedIndex;
                }

                if (
                    Number.isInteger(
                        this.windowChoicesMain.selectedIndex
                    )
                ) {
                    return this.windowChoicesMain.selectedIndex;
                }

                if (
                    Number.isInteger(
                        this.windowChoicesMain.currentIndex
                    )
                ) {
                    return this.windowChoicesMain.currentIndex;
                }
            }

            return 0;
        }

        _ip2liveIsCapturingKey() {
            return !!(
                this.showPress ||
                this.waitingForKey ||
                this.awaitingKey ||
                this.rebinding ||
                this.isListeningForKey ||
                this.capturingKey
            );
        }

        _ip2liveBindingName(control) {
            if (
                !control
            ) {
                return '';
            }

            try {
                if (
                    typeof control.name ===
                    'function'
                ) {
                    return String(
                        control.name() ||
                        ''
                    );
                }
            } catch (error) {}

            return String(
                control.name ||
                control.description ||
                control.abr ||
                control.abbreviation ||
                ''
            );
        }

        _ip2liveFindControl(
            tokens,
            fallbackIndex
        ) {
            const ordered =
                Data &&
                Data.Keyboards &&
                Array.isArray(
                    Data.Keyboards.listOrdered
                )
                    ? Data.Keyboards.listOrdered.filter(
                        Boolean
                    )
                    : [];

            const upperTokens =
                tokens.map(
                    (
                        token
                    ) =>
                        String(
                            token
                        ).toUpperCase()
                );

            for (
                let i = 0;
                i < ordered.length;
                i++
            ) {
                const name =
                    this._ip2liveBindingName(
                        ordered[i]
                    ).toUpperCase();

                if (
                    upperTokens.every(
                        (
                            token
                        ) =>
                            name.includes(
                                token
                            )
                    )
                ) {
                    return ordered[i];
                }
            }

            return ordered[
                fallbackIndex
            ] ||
            null;
        }

        _ip2liveKeyName(code) {
            const n =
                Number(
                    code
                );

            const special = {
                8:
                    'BACKSPACE',

                9:
                    'TAB',

                13:
                    'ENTER',

                16:
                    'SHIFT',

                17:
                    'CTRL',

                18:
                    'ALT',

                27:
                    'ESC',

                32:
                    'SPACE',

                33:
                    'PAGEUP',

                34:
                    'PAGEDOWN',

                35:
                    'END',

                36:
                    'HOME',

                37:
                    'ARROWLEFT',

                38:
                    'ARROWUP',

                39:
                    'ARROWRIGHT',

                40:
                    'ARROWDOWN',

                45:
                    'INSERT',

                46:
                    'DELETE',
            };

            if (
                special[n]
            ) {
                return special[n];
            }

            if (
                n >= 48 &&
                n <= 90
            ) {
                return String.fromCharCode(
                    n
                );
            }

            if (
                n >= 96 &&
                n <= 105
            ) {
                return 'NUM' +
                    (
                        n -
                        96
                    );
            }

            return String(
                code
            );
        }

        _ip2liveControlText(
            control,
            fallback
        ) {
            if (
                !control
            ) {
                return fallback;
            }

            try {
                if (
                    typeof control.toString ===
                    'function'
                ) {
                    const text =
                        String(
                            control.toString() ||
                            ''
                        ).trim();

                    if (
                        text &&
                        text !==
                            '[object Object]'
                    ) {
                        return text.toUpperCase();
                    }
                }
            } catch (error) {}

            const sc =
                control.sc;

            if (
                Array.isArray(
                    sc
                ) &&
                sc.length
            ) {
                return sc
                    .map(
                        (
                            combo
                        ) => {
                            const values =
                                Array.isArray(
                                    combo
                                )
                                    ? combo
                                    : [combo];

                            return values
                                .map(
                                    (
                                        code
                                    ) =>
                                        this._ip2liveKeyName(
                                            code
                                        )
                                )
                                .join(
                                    ' + '
                                );
                        }
                    )
                    .join(
                        ' | '
                    );
            }

            return fallback;
        }

        _ip2liveRows() {
            const menu =
                Data &&
                Data.Keyboards
                    ? (
                        Data.Keyboards.menuControls ||
                        {}
                    )
                    : {};

            const heroUp =
                this._ip2liveFindControl(
                    ['HERO', 'UP'],
                    0
                ) ||
                this._ip2liveFindControl(
                    ['UP'],
                    0
                );

            const heroDown =
                this._ip2liveFindControl(
                    ['HERO', 'DOWN'],
                    1
                ) ||
                this._ip2liveFindControl(
                    ['DOWN'],
                    1
                );

            const heroLeft =
                this._ip2liveFindControl(
                    ['HERO', 'LEFT'],
                    2
                ) ||
                this._ip2liveFindControl(
                    ['LEFT'],
                    2
                );

            const heroRight =
                this._ip2liveFindControl(
                    ['HERO', 'RIGHT'],
                    3
                ) ||
                this._ip2liveFindControl(
                    ['RIGHT'],
                    3
                );

            return [
                {
                    label:
                        'MOVE HERO UP',

                    control:
                        heroUp,

                    fallback:
                        'W',
                },

                {
                    label:
                        'MOVE HERO DOWN',

                    control:
                        heroDown,

                    fallback:
                        'S',
                },

                {
                    label:
                        'MOVE HERO LEFT',

                    control:
                        heroLeft,

                    fallback:
                        'A',
                },

                {
                    label:
                        'MOVE HERO RIGHT',

                    control:
                        heroRight,

                    fallback:
                        'D',
                },

                {
                    label:
                        'MOVE MENU UP',

                    control:
                        menu.Up,

                    fallback:
                        'ARROWUP | W',
                },

                {
                    label:
                        'MOVE MENU DOWN',

                    control:
                        menu.Down,

                    fallback:
                        'ARROWDOWN | S',
                },
            ];
        }

        _ip2liveDrawBindingRow(
            ctx,
            x,
            y,
            w,
            h,
            s,
            font,
            label,
            value,
            active
        ) {
            const cut =
                9 * s;

            ctx.save();

            /*
             * Depth.
             */
            IP2LiveSettingsTheme.traceBeveledRect(
                ctx,

                x + 4 * s,
                y + 5 * s,

                w,
                h,
                cut
            );

            ctx.fillStyle =
                'rgba(0,0,6,0.72)';

            ctx.fill();

            ctx.strokeStyle =
                'rgba(0,240,255,0.18)';

            ctx.lineWidth =
                Math.max(
                    1,
                    0.8 * s
                );

            ctx.stroke();

            /*
             * Main row.
             */
            IP2LiveSettingsTheme.traceBeveledRect(
                ctx,
                x,
                y,
                w,
                h,
                cut
            );

            const grad =
                ctx.createLinearGradient(
                    x,
                    y,
                    x + w,
                    y
                );

            if (
                active
            ) {
                grad.addColorStop(
                    0,
                    'rgba(30,32,15,0.99)'
                );

                grad.addColorStop(
                    0.52,
                    'rgba(8,20,24,0.99)'
                );

                grad.addColorStop(
                    1,
                    'rgba(3,10,20,0.99)'
                );
            } else {
                grad.addColorStop(
                    0,
                    'rgba(4,17,31,0.98)'
                );

                grad.addColorStop(
                    0.60,
                    'rgba(3,9,20,0.98)'
                );

                grad.addColorStop(
                    1,
                    'rgba(2,13,23,0.98)'
                );
            }

            ctx.fillStyle =
                grad;

            ctx.fill();

            ctx.strokeStyle =
                active
                    ? '#FFE600'
                    : 'rgba(0,240,255,0.62)';

            ctx.lineWidth =
                Math.max(
                    1,
                    (
                        active
                            ? 1.7
                            : 1.0
                    ) *
                    s
                );

            ctx.shadowColor =
                active
                    ? '#FFE600'
                    : '#00F0FF';

            ctx.shadowBlur =
                active
                    ? 10 * s
                    : 3 * s;

            ctx.stroke();

            ctx.shadowBlur =
                0;

            IP2LiveSettingsTheme.drawBevelFacets(
                ctx,
                x,
                y,
                w,
                h,
                cut,
                (
                    active
                        ? 3.1
                        : 2.4
                ) *
                s,
                '#00F0FF'
            );

            if (
                active
            ) {
                IP2LiveSettingsTheme.drawEdgePlate(
                    ctx,

                    x - 5 * s,
                    y + 6 * s,

                    12 * s,
                    h - 12 * s,

                    3 * s,

                    '#FFE600'
                );
            }

            IP2LiveSettingsTheme.drawEdgePlate(
                ctx,

                x +
                (
                    active
                        ? 11
                        : 18
                ) *
                s,

                y +
                h -
                3.7 * s,

                w -
                (
                    active
                        ? 22
                        : 36
                ) *
                s,

                (
                    active
                        ? 2.7
                        : 2.1
                ) *
                s,

                4 * s,

                active
                    ? '#FFE600'
                    : '#00F0FF'
            );

            /*
             * Action name.
             */
            ctx.textBaseline =
                'middle';

            ctx.textAlign =
                'left';

            ctx.font =
                'bold ' +
                Math.round(
                    13.5 * s
                ) +
                'px ' +
                font;

            ctx.fillStyle =
                '#FFFFFF';

            ctx.fillText(
                label,
                x + 22 * s,
                y +
                h /
                2 +
                0.5 * s
            );

            /*
             * Binding value box.
             */
            const valueW =
                Math.min(
                    185 * s,
                    w * 0.42
                );

            const valueX =
                x +
                w -
                valueW -
                16 * s;

            IP2LiveSettingsTheme.traceBeveledRect(
                ctx,

                valueX,

                y +
                8 * s,

                valueW,

                h -
                16 * s,

                5 * s
            );

            ctx.fillStyle =
                active
                    ? 'rgba(255,230,0,0.08)'
                    : 'rgba(0,240,255,0.045)';

            ctx.fill();

            ctx.strokeStyle =
                active
                    ? 'rgba(255,230,0,0.82)'
                    : 'rgba(0,240,255,0.48)';

            ctx.lineWidth =
                Math.max(
                    1,
                    0.9 * s
                );

            ctx.stroke();

            ctx.textAlign =
                'center';

            ctx.font =
                'bold ' +
                Math.round(
                    10 * s
                ) +
                'px ' +
                font;

            ctx.fillStyle =
                active
                    ? '#FFE600'
                    : '#A9F7FF';

            const safeValue =
                String(
                    value ||
                    ''
                ).length >
                24
                    ? String(
                        value
                    ).slice(
                        0,
                        22
                    ) +
                    '…'
                    : String(
                        value ||
                        ''
                    );

            ctx.fillText(
                safeValue,

                valueX +
                valueW /
                2,

                y +
                h /
                2 +
                0.5 * s
            );

            ctx.restore();
        }

        drawHUD() {
            this._ip2liveEnsureModernState();

            const ctx =
                Common.Platform.ctx;

            const cW =
                ctx.canvas.width;

            const cH =
                ctx.canvas.height;

            const s =
                Math.max(
                    0.72,
                    Math.min(
                        cW / 1280,
                        cH / 720
                    )
                );

            const font =
                IP2Live.Assets &&
                IP2Live.Assets.oxaniumMediumLoaded
                    ? 'Oxanium-Medium'
                    : 'monospace';

            const easeIn =
                IP2LiveSettingsTheme.easeOutCubic(
                    this._ip2liveModernFade ||
                    1
                );

            const panelW =
                600 * s;

            const panelH =
                500 * s;

            const x =
                (
                    cW -
                    panelW
                ) /
                2;

            const y =
                (
                    cH -
                    panelH
                ) /
                2 +
                (
                    1 -
                    easeIn
                ) *
                18 * s;

            ctx.save();

            /*
             * Background.
             */
            IP2LiveSettingsTheme.drawBackdrop(
                ctx,

                cW,
                cH,

                this._ip2liveModernBgFx ||
                    this.bgFx,

                s,

                this._ip2liveModernScan
            );

            ctx.globalAlpha =
                easeIn;

            /*
             * Panel.
             */
            IP2LiveSettingsTheme.drawPanel(
                ctx,
                x,
                y,
                panelW,
                panelH,
                s,

                this.animTick ||
                    0
            );

            /*
             * Title.
             */
            ctx.textAlign =
                'center';

            ctx.textBaseline =
                'middle';

            ctx.font =
                'bold ' +
                Math.round(
                    25 * s
                ) +
                'px ' +
                font;

            ctx.fillStyle =
                '#FFFFFF';

            ctx.shadowColor =
                'rgba(0,240,255,0.24)';

            ctx.shadowBlur =
                5 * s;

            ctx.fillText(
                'KEY BINDINGS',

                x +
                panelW /
                2,

                y +
                42 * s
            );

            ctx.shadowBlur =
                0;

            IP2LiveSettingsTheme.drawSectionRail(
                ctx,

                x +
                36 * s,

                y +
                63 * s,

                panelW -
                72 * s,

                4 * s,

                s
            );

            /*
             * Bindings.
             */
            const rows =
                this._ip2liveRows();

            const selected =
                this._ip2liveSelectedIndex();

            const rowX =
                x +
                38 * s;

            const rowW =
                panelW -
                76 * s;

            const rowH =
                48 * s;

            const gap =
                9 * s;

            const startY =
                y +
                86 * s;

            for (
                let i = 0;
                i < rows.length;
                i++
            ) {
                const row =
                    rows[i];

                this._ip2liveDrawBindingRow(
                    ctx,

                    rowX,

                    startY +
                    i *
                    (
                        rowH +
                        gap
                    ),

                    rowW,
                    rowH,
                    s,
                    font,

                    row.label,

                    this._ip2liveControlText(
                        row.control,
                        row.fallback
                    ),

                    selected ===
                        i
                );
            }

            /*
             * Existing Reset + Back controls remain on
             * Key Bindings because the user's request only
             * changes the MAIN Settings Back button.
             */
            const buttonY =
                y +
                panelH -
                70 * s;

            const buttonGap =
                18 * s;

            const buttonW =
                (
                    rowW -
                    buttonGap
                ) /
                2;

            IP2LiveSettingsTheme.drawMenuButton(
                ctx,
                {
                    x:
                        rowX,

                    y:
                        buttonY,

                    w:
                        buttonW,

                    h:
                        44 * s,

                    s,

                    font,

                    label:
                        'RESET DEFAULTS',

                    subtitle:
                        '',

                    active:
                        selected ===
                        rows.length,

                    danger:
                        false,

                    disabled:
                        false,

                    tick:
                        this.animTick ||
                        0,
                }
            );

            IP2LiveSettingsTheme.drawMenuButton(
                ctx,
                {
                    x:
                        rowX +
                        buttonW +
                        buttonGap,

                    y:
                        buttonY,

                    w:
                        buttonW,

                    h:
                        44 * s,

                    s,

                    font,

                    label:
                        'BACK',

                    subtitle:
                        '',

                    active:
                        selected ===
                        rows.length +
                        1,

                    danger:
                        true,

                    disabled:
                        false,

                    tick:
                        this.animTick ||
                        0,
                }
            );

            /*
             * Key capture popup.
             */
            if (
                this._ip2liveIsCapturingKey()
            ) {
                ctx.fillStyle =
                    'rgba(0,3,10,0.68)';

                ctx.fillRect(
                    0,
                    0,
                    cW,
                    cH
                );

                const modalW =
                    330 * s;

                const modalH =
                    116 * s;

                const modalX =
                    (
                        cW -
                        modalW
                    ) /
                    2;

                const modalY =
                    (
                        cH -
                        modalH
                    ) /
                    2;

                IP2LiveSettingsTheme.drawPanel(
                    ctx,
                    modalX,
                    modalY,
                    modalW,
                    modalH,
                    s,

                    this.animTick ||
                        0
                );

                ctx.textAlign =
                    'center';

                ctx.textBaseline =
                    'middle';

                ctx.font =
                    'bold ' +
                    Math.round(
                        18 * s
                    ) +
                    'px ' +
                    font;

                ctx.fillStyle =
                    '#FFFFFF';

                ctx.fillText(
                    'PRESS A KEY',

                    modalX +
                    modalW /
                    2,

                    modalY +
                    42 * s
                );

                ctx.font =
                    Math.round(
                        8 * s
                    ) +
                    'px ' +
                    font;

                ctx.fillStyle =
                    'rgba(176,239,247,0.72)';

                ctx.fillText(
                    'ESC TO CANCEL',

                    modalX +
                    modalW /
                    2,

                    modalY +
                    76 * s
                );
            }

            ctx.restore();
        }
    }

    /*
     * Mark wrapped class.
     */
    IP2LiveModernKeyboardMenu.__ip2liveModernSkinApplied =
        true;

    window.IP2LiveKeyboardMenu =
        IP2LiveModernKeyboardMenu;

    return true;
}


/*
 * Expose helper so it can run again if keyboard.js
 * is loaded later than settings.js.
 */
IP2Live._modernizeKeyboardMenuUI =
    IP2LiveModernizeKeyboardMenuUI;


/*
 * Attempt immediately.
 */
IP2LiveModernizeKeyboardMenuUI();


console.log(
    '[IP2Live] settings.js modern UI loaded.'
);