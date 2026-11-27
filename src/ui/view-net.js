// Draws a driver net: inputs on the left, outputs on the right,
// nodes coloured by their current activation.
import { fitCanvas } from './theme.js';

const INPUT_LABELS = {
  ray: (ch) => `${ch.angle > 0 ? '+' : ''}${ch.angle}°`,
  speed: () => 'Tempo', slip: () => 'Rutschen', steer: () => 'Lenkwinkel',
  grip: () => 'Haftung', fuel: () => 'Sprit', pace: () => 'Vorgabe',
};
const OUTPUT_LABELS = ['Lenken', 'Gas / Bremse'];

function mix(theme, value) {
  // value in [-1, 1] -> colour between the negative and the positive hue, via the surface colour
  const colour = value >= 0 ? theme.pos : theme.neg;
  return { colour, alpha: Math.min(1, Math.abs(value)) };
}

export function createNetView(canvas, getTheme) {
  const ctx = canvas.getContext('2d');
  return {
    /**
     * @param {number[]} sizes layer sizes
     * @param {Float32Array|null} genome weights; null draws an empty net
     * @param {Float32Array|null} input current input values
     * @param {Float32Array[]|null} scratch activations per layer after the input
     * @param {object[]} channels rule channels, for the input labels
     */
    draw(sizes, genome, input, scratch, channels) {
      fitCanvas(canvas);
      const theme = getTheme();
      const ratio = canvas.width / Math.max(1, canvas.clientWidth);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const left = 76 * ratio, right = 92 * ratio, top = 10 * ratio, bottom = 10 * ratio;
      const colX = (l) => left + ((W - left - right) * l) / (sizes.length - 1);
      const rowY = (l, i) => top + ((H - top - bottom) * (i + 0.5)) / sizes[l];
      const radius = Math.max(2.5 * ratio, Math.min(6 * ratio, (H - top - bottom) / (2.6 * Math.max(...sizes))));

      // connections
      if (genome) {
        let p = 0;
        ctx.lineWidth = Math.max(1, ratio * 0.9);
        for (let l = 1; l < sizes.length; l++) {
          const nin = sizes[l - 1];
          let scale = 0;
          for (let k = 0; k < (nin + 1) * sizes[l]; k++) scale = Math.max(scale, Math.abs(genome[p + k]));
          scale = scale || 1;
          for (let j = 0; j < sizes[l]; j++) {
            for (let i = 0; i < nin; i++) {
              const w = genome[p++] / scale;
              const a = Math.abs(w);
              if (a < 0.18) continue; // weak connections would only add haze
              ctx.strokeStyle = w >= 0 ? theme.pos : theme.neg;
              ctx.globalAlpha = 0.08 + 0.5 * a * a;
              ctx.beginPath();
              ctx.moveTo(colX(l - 1), rowY(l - 1, i));
              ctx.lineTo(colX(l), rowY(l, j));
              ctx.stroke();
            }
            p++; // bias
          }
        }
        ctx.globalAlpha = 1;
      }

      // nodes
      for (let l = 0; l < sizes.length; l++) {
        const values = l === 0 ? input : scratch?.[l - 1];
        for (let i = 0; i < sizes[l]; i++) {
          const x = colX(l), y = rowY(l, i);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = theme.surface;
          ctx.fill();
          if (values) {
            const { colour, alpha } = mix(theme, values[i]);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = colour;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = theme['ink-2'];
          ctx.lineWidth = Math.max(1, ratio * 0.8);
          ctx.stroke();
        }
      }

      // labels
      ctx.fillStyle = theme['ink-2'];
      ctx.font = `${11.5 * ratio}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      channels.forEach((ch, i) => {
        ctx.fillText((INPUT_LABELS[ch.type] ?? (() => ch.type))(ch), colX(0) - radius - 5 * ratio, rowY(0, i));
      });
      ctx.textAlign = 'left';
      const last = sizes.length - 1;
      for (let i = 0; i < sizes[last]; i++) {
        ctx.fillText(OUTPUT_LABELS[i] ?? '', colX(last) + radius + 5 * ratio, rowY(last, i));
      }
    },
  };
}
