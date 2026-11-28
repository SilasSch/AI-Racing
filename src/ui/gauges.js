// Fuel, tyres and damage of one car, and what its strategy net last said.

const pct = (v) => `${Math.round(v * 100)} %`;

function setGauge(el, share, text, warn) {
  el.querySelector('i').style.width = `${Math.max(0, Math.min(1, share)) * 100}%`;
  el.querySelector('output').textContent = text;
  el.classList.toggle('warn', Boolean(warn));
}

/**
 * @param {object|null} car a car of an endurance world, or null to blank the display
 * @param {object} rules its rule set
 */
export function updateGauges(car, rules) {
  const $ = (id) => document.getElementById(id);
  const e = rules.endurance;
  if (!car || !car.cond) {
    for (const id of ['g-fuel', 'g-tyres', 'g-damage']) setGauge($(id), 0, '–', false);
    $('radio').textContent = '';
    return;
  }
  const cond = car.cond;
  const fuel = cond.fuel / e.tank;
  const tyres = 1 - Math.min(1, cond.wear);
  setGauge($('g-fuel'), fuel, pct(fuel), fuel < 0.1);
  setGauge($('g-tyres'), tyres, pct(tyres), cond.wear > e.cliff);
  $('g-tyres').querySelector('.mark').style.left = `${(1 - e.cliff) * 100}%`; // below this the grip falls steeply
  setGauge($('g-damage'), cond.damage, pct(cond.damage), cond.damage > 0.5);
  $('radio').innerHTML = radioText(car);
}

/** The strategy net's last answer, in words. */
export function radioText(car) {
  if (car.pit) return `<strong>Boxenfunk:</strong> steht in der Box, noch ${Math.ceil(car.pit.left)} s.`;
  const d = car.decision;
  if (!d) return '<strong>Boxenfunk:</strong> noch keine Entscheidung.';
  const pace = `Tempo ${Math.round(d.pace * 100)} %`;
  if (!d.box) return `<strong>Boxenfunk:</strong> draußen bleiben · ${pace}`;
  return `<strong>Boxenfunk:</strong> diese Runde an die Box · tanken auf ${Math.round(d.fuelTarget * 100)} % · ${d.tyres ? 'neue Reifen' : 'Reifen bleiben'} · ${pace}`;
}
