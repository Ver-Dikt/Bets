// Binary head-to-head ratings in independent game pools.
export const logistic = x => 1 / (1 + Math.exp(-x));
export const logit = p => Math.log(p / (1 - p));
export const clampProbability = p => Math.max(.001, Math.min(.999, p));
const square = value => value * value;
const density = z => Math.exp(-square(z) / 2) / Math.sqrt(2 * Math.PI);
function normal(z) {
  const x = Math.abs(z);
  const t = 1 / (1 + .2316419 * x);
  const tail = density(x) * t * (.319381530 + t * (-.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z < 0 ? tail : 1 - tail;
}

export const initialGlicko = {mu: 0, phi: 350 / 173.7178, sigma: .06};
const g = phi => 1 / Math.sqrt(1 + 3 * square(phi / Math.PI));
const expectation = (self, opponent) => logistic(g(opponent.phi) * (self.mu - opponent.mu));

// Glickman, Example of the Glicko-2 System, steps 3–7. Rating period is
// one observed series; idle weeks inflate uncertainty before each update.
export function updateGlicko(self, opponents, tau = .5) {
  let information = 0;
  let surprise = 0;
  for (const {rating, result} of opponents) {
    const p = expectation(self, rating);
    const impact = g(rating.phi);
    information += square(impact) * p * (1 - p);
    surprise += impact * (result - p);
  }
  if (!information) return {...self, phi: Math.hypot(self.phi, self.sigma)};
  const variance = 1 / information;
  const delta = variance * surprise;
  const alpha = Math.log(square(self.sigma));
  const objective = x => {
    const e = Math.exp(x);
    return e * (square(delta) - square(self.phi) - variance - e) /
      (2 * square(square(self.phi) + variance + e)) - (x - alpha) / square(tau);
  };
  let left = alpha;
  let right;
  if (square(delta) > square(self.phi) + variance) {
    right = Math.log(square(delta) - square(self.phi) - variance);
  } else {
    right = alpha - tau;
    while (objective(right) < 0) right -= tau;
  }
  let fl = objective(left);
  let fr = objective(right);
  while (Math.abs(right - left) > .000001) {
    const mid = left + (left - right) * fl / (fr - fl);
    const fm = objective(mid);
    if (fm * fr <= 0) {
      left = right;
      fl = fr;
    } else fl /= 2;
    right = mid;
    fr = fm;
  }
  const sigma = Math.exp(left / 2);
  const phi = 1 / Math.sqrt(1 / (square(self.phi) + square(sigma)) + information);
  return {mu: self.mu + square(phi) * surprise, phi, sigma};
}

export const initialSkill = {mu: 25, sigma: 25 / 3};
const beta = 25 / 6;
const drift = 25 / 300;
export const trueSkillProbability = (a, b) => normal((a.mu - b.mu) / Math.hypot(a.sigma, b.sigma, Math.SQRT2 * beta));

// TrueSkill's two-team, single-rating, no-draw Gaussian update.
export function updateTrueSkill(a, b, result) {
  const sa = Math.hypot(a.sigma, drift);
  const sb = Math.hypot(b.sigma, drift);
  const c = Math.hypot(sa, sb, Math.SQRT2 * beta);
  const direction = result === 1 ? 1 : -1;
  const z = direction * (a.mu - b.mu) / c;
  const v = density(z) / Math.max(1e-15, normal(z));
  const w = Math.max(0, Math.min(1, v * (v + z)));
  return [
    {mu: a.mu + direction * square(sa) / c * v, sigma: sa * Math.sqrt(1 - w * square(sa / c))},
    {mu: b.mu - direction * square(sb) / c * v, sigma: sb * Math.sqrt(1 - w * square(sb / c))}
  ];
}

const msDay = 86400000;
const decay = (days, halfLife) => 2 ** (-days / halfLife);
const inactive = (state, at) => state.last ? (at - state.last) / msDay : 0;
const idleGlicko = (state, at) => ({
  ...state.glicko,
  phi: Math.min(initialGlicko.phi, Math.hypot(state.glicko.phi, state.glicko.sigma * Math.sqrt(inactive(state, at) / 7)))
});

export function newRating() {
  return {elo: 0, glicko: initialGlicko, skill: initialSkill, bt: 0, btInfo: 2, wins: 0, losses: 0, last: null, seen: 0};
}

export function ratings(a, b, at, config) {
  const ag = idleGlicko(a, at);
  const bg = idleGlicko(b, at);
  const dynamicElo = logistic(config.eloScale * (a.elo * decay(inactive(a, at), config.halfLife) -
    b.elo * decay(inactive(b, at), config.halfLife)));
  const glicko2 = logistic(g(Math.hypot(ag.phi, bg.phi) / Math.SQRT2) * (ag.mu - bg.mu));
  const trueSkill = trueSkillProbability(a.skill, b.skill);
  const bradleyTerry = logistic(a.bt - b.bt);
  // Independent beta posteriors for decayed team strength; compare odds.
  const posterior = team => {
    const weight = decay(inactive(team, at), config.formHalfLife);
    return (2 + team.wins * weight) / (4 + (team.wins + team.losses) * weight);
  };
  const bayesian = logistic(.65 * (logit(posterior(a)) - logit(posterior(b))));
  return {dynamicElo, glicko2, trueSkill, bradleyTerry, bayesian};
}

export function updateRatings(a, b, result, at, config) {
  const ag = idleGlicko(a, at);
  const bg = idleGlicko(b, at);
  [a.skill, b.skill] = updateTrueSkill(a.skill, b.skill, result);
  a.glicko = updateGlicko(ag, [{rating: bg, result}]);
  b.glicko = updateGlicko(bg, [{rating: ag, result: 1 - result}]);
  a.elo *= decay(inactive(a, at), config.halfLife);
  b.elo *= decay(inactive(b, at), config.halfLife);
  const surprise = result - logistic(config.eloScale * (a.elo - b.elo));
  const btExpected = logistic(a.bt - b.bt);
  for (const [team, outcome, sign] of [[a, result, 1], [b, 1 - result, -1]]) {
    const weight = decay(inactive(team, at), config.formHalfLife);
    team.wins = team.wins * weight + outcome;
    team.losses = team.losses * weight + 1 - outcome;
    team.elo += sign * config.eloK * (1 + 1 / Math.sqrt(1 + team.seen / 6)) * surprise;
    // Online regularized Bradley–Terry likelihood, diagonal Newton step.
    team.btInfo = 2 + .99 * (team.btInfo - 2) + btExpected * (1 - btExpected);
    team.bt += (sign * (result - btExpected) - .08 * team.bt) / team.btInfo;
    team.seen++;
    team.last = at;
  }
}
