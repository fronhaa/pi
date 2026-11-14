import type { StringKey } from './strings';

/**
 * Textos da base lunar (docs/game-design.md, "Base lunar"): substituem os de Marte quando a base fica na Lua.
 * Só entram aqui as chaves que MUDAM; o resto vem de strings.ts. Na Lua o turno é um dia da Terra, não um sol.
 * Toda chave precisa existir nos dois idiomas (o TypeScript confere).
 */
const pt = {
  'game.title': 'Missão Shackleton',
  'game.subtitle': 'Moon Base · Polo sul da Lua',
  'top.sol': 'Dia {sol} de {total}',

  'help.life': 'Ar, água e comida da tripulação. Precisa de 3 blocos por dia para ficar estável. Se chegar a 0, a missão acaba.',
  'help.shield': 'A blindagem é a proteção da base contra a radiação do Sol, feita com sacos de regolito (a terra da Lua). Ela se desgasta um pouco todo dia.',
  'help.dose': 'Dose é quanta radiação a tripulação já recebeu. Na Lua não há ar para proteger: ela sobe o dobro de Marte todo dia. Em 100, a tripulação precisa voltar para a Terra. Este número é uma escala do jogo, não uma medição real.',
  'help.sol': 'Na base lunar contamos os dias da Terra (24 horas). Um dia inteiro da Lua dura 29 dias e meio da Terra!',
  'help.dust': 'Poeira cobre os painéis solares e diminui a energia. Na Lua não há vento: a poeira só sai se um astronauta limpar.',
  'help.battery': 'A bateria guarda a energia que sobra. Enquanto a tripulação dorme, a base gasta 15. Na sombra faz muito frio, e os aquecedores gastam 30.',

  'plan.hint.battery': '+10 por bloco; até amanhã a base gasta {cost}',
  'preview.tonight': 'até amanhã:',
  'preview.afterNight': 'amanhã cedo:',
  'preview.batteryShort': '⚠️ A bateria vai acabar antes de amanhã: suporte de vida −{life}. Guarde mais blocos!',
  'preview.stormTonight': '🌩️ Tempestade solar (classe {label}) hoje: com blindagem {shield}, a dose sobe +{dose}.',
  'preview.stormTomorrow': '📡 Amanhã vem tempestade classe {label}: com a blindagem de hoje ({shield}), a dose seria +{dose}.',
  'preview.allGood': '✅ Com este plano, a base chega bem até amanhã.',
  'day.remaining': '{s} s até a hora de dormir',
  'msg.stormToday': 'A tempestade solar (classe {label}) chega hoje. Última chance de reforçar a blindagem!',
  'report.night.ok': 'A tripulação dormiu, e a base gastou {cost} de bateria com ar, água e computadores.',
  'report.night.short': 'A bateria acabou antes de amanhã! Faltaram {missing} e o suporte de vida caiu {lifeLost}.',
  'end.lesson.energy': 'Energia é limitada e a sombra cobra a conta: guardar bateria é tão importante quanto usar.',

  'problem.antenna': 'Terra escondida',
  'problem.antenna.where': 'Torre da antena: apontar para o satélite',
  'report.problem.failed.antenna': 'A Terra sumiu atrás das montanhas, e ninguém apontou a antena para o satélite: amanhã as mensagens não chegam.',
  'msg.noSignal': 'Sem sinal! A Terra está atrás das montanhas, e a antena não foi apontada para o satélite.',

  'plan.hint.shield': '+8 por bloco; perde 4 por dia',
  'plan.endSol': 'Terminar o dia',
  'day.title': 'Dia na Lua',

  'msg.delay': 'A mensagem chegou em cerca de 1 segundo',
  'msg.stormAlert': 'Tempestade solar a caminho! Erupção classe {label}. O impacto é amanhã (dia {sol}). Reforcem a blindagem.',

  'card.mysteryRock.text': 'O rover achou uma rocha clara e brilhante. Ela pode contar como a Lua se formou!',
  'card.cargoShip.text': 'Uma nave de carga vem da Terra, numa viagem de 3 dias. Só cabe uma coisa: o que vocês pedem?',
  'card.brokenSensor.text': 'Um sensor parou. A Terra sabe consertar, e daqui da Lua a resposta chega em segundos.',
  'card.brokenSensor.askEarth': 'Pedir ajuda à Terra: ciência −3 (a espera é curtinha)',
  'card.brokenSensor.lesson': 'Na Lua, a Terra responde em 1 segundo. Em Marte, a resposta leva minutos, e a equipe muitas vezes decide sozinha.',
  'card.brokenSensor.askEarth.result': 'A Terra respondeu na hora. A ciência quase não atrasou.',
  'card.subsurfaceIce.title': 'Gelo na cratera escura',
  'card.subsurfaceIce.text': 'Perto da base há uma cratera onde o Sol nunca bate. Lá dentro tem gelo, e gelo vira água e ar!',
  'card.subsurfaceIce.lesson': 'Em 2009, a sonda LCROSS da NASA achou gelo de água numa cratera escura.',
  'card.roverRoute.text': 'O rover vai até uma rocha nova. O atalho passa pela poeira fofa da borda de uma cratera.',
  'card.roverRoute.lesson': 'Rovers andam devagar e olham o caminho antes, para não atolar na poeira fofa.',
  'card.roverRoute.stuck': 'A poeira era fofa e o rover atolou! Mandem alguém resgatar hoje.',

  'report.title': 'Relatório do dia {sol}',
  'report.next': 'Começar o dia {sol}',
  'report.night': 'Noite na Lua…',

  'end.won.text': 'A tripulação chegou ao fim do dia {sol} em segurança.',
  'end.lost.life.text': 'No dia {sol}, o suporte de vida chegou a zero: faltou ar, água ou comida. Sem energia suficiente, a base não consegue manter a tripulação.',
  'end.lost.dose.text': 'No dia {sol}, a dose de radiação chegou a 100. Sem ar e sem blindagem, as tempestades solares pesam muito na Lua.',
  'end.star1': 'Sobreviveu aos 15 dias',
  'end.lesson.shield': 'Sem ar, a Lua não protege nada: a blindagem é ainda mais importante que em Marte.',
  'end.lesson.delay': 'A Terra está perto: da Lua, as mensagens chegam em cerca de 1 segundo. Em Marte, levam de 3 a 22 minutos!',

  'tutorial.1.text': 'Sua tripulação vive no polo sul da Lua, perto da cratera Shackleton, por 15 dias.',
  'tutorial.2.text': 'Todo dia os painéis dão blocos de energia: quanto mais Sol, mais blocos. Você divide entre suporte de vida, blindagem e ciência. O que sobrar vai para a bateria, que a base gasta enquanto todos dormem.',
  'tutorial.3.text': 'A Terra avisa quando vem uma tempestade solar. Reforce a blindagem antes! Às vezes as montanhas fazem sombra por dias: guarde bateria. Durante o dia, problemas aparecem pela base: mande um astronauta consertar.',

  'data.donki.use': 'Cada tempestade solar do jogo usa uma erupção solar real registrada pela NASA, com a data e a classe (M = média, X = forte). A dose no jogo é uma escala nossa, não uma medição na Lua.',
  'data.rad.name': 'LND: radiação medida no chão da Lua',
  'data.rad.badge': 'medido em 2019',
  'data.rad.use': 'A sonda chinesa Chang’e 4 mediu cerca de 1,4 mSv de radiação por dia no chão da Lua, uns 2 vezes o que o rover Curiosity mediu em Marte. A dose do jogo é uma escala diferente.',
  'data.rad.link': 'https://doi.org/10.1126/sciadv.aaz1334',
  'data.radlab.use': 'Em breve: medições reais feitas na ISS, em órbita da Terra (não na Lua).',
  'data.marstrek.name': 'Moon Trek: relevo da Lua',
  'data.marstrek.use': 'Em breve: o terreno real do polo sul da Lua. Hoje o terreno é gerado pelo jogo.',
  'data.marstrek.link': 'https://trek.nasa.gov/moon/',

  'scene.loadingPhysics': 'Carregando a física da Lua…',
  'crew.fact.gravity': 'Na Lua a gravidade é só 1/6 da que temos na Terra: o mesmo pulo sobe cerca de 6 vezes mais alto!',
  'crew.fact.source': 'Fonte: NASA',
} as const satisfies Partial<Record<StringKey, string>>;

const en: Record<keyof typeof pt, string> = {
  'game.title': 'Mission Shackleton',
  'game.subtitle': 'Moon Base · Lunar south pole',
  'top.sol': 'Day {sol} of {total}',

  'help.life': 'Air, water and food for the crew. It needs 3 blocks per day to stay steady. If it reaches 0, the mission ends.',
  'help.shield': 'Shielding protects the base from the Sun’s radiation, made with bags of regolith (Moon soil). It wears down a little every day.',
  'help.dose': 'Dose is how much radiation the crew has received. The Moon has no air to protect you: it goes up twice as much as on Mars every day. At 100, the crew must go back to Earth. This number is a game scale, not a real measurement.',
  'help.sol': 'At the Moon base we count Earth days (24 hours). A whole Moon day lasts 29 and a half Earth days!',
  'help.dust': 'Dust covers the solar panels and lowers the energy. There is no wind on the Moon: dust only comes off if an astronaut cleans it.',
  'help.battery': 'The battery stores leftover energy. While the crew sleeps, the base uses 15. In the shadow it is very cold, and the heaters use 30.',

  'plan.hint.battery': '+10 per block; until tomorrow the base uses {cost}',
  'preview.tonight': 'until tomorrow:',
  'preview.afterNight': 'tomorrow morning:',
  'preview.batteryShort': '⚠️ The battery will run out before tomorrow: life support −{life}. Save more blocks!',
  'preview.stormTonight': '🌩️ Solar storm (class {label}) today: with shielding {shield}, the dose goes up +{dose}.',
  'preview.stormTomorrow': '📡 A class {label} storm comes tomorrow: with today’s shielding ({shield}), the dose would be +{dose}.',
  'preview.allGood': '✅ With this plan, the base gets to tomorrow fine.',
  'day.remaining': '{s} s until bedtime',
  'msg.stormToday': 'The solar storm (class {label}) arrives today. Last chance to reinforce the shielding!',
  'report.night.ok': 'The crew slept, and the base used {cost} battery for air, water and computers.',
  'report.night.short': 'The battery ran out before tomorrow! {missing} was missing and life support dropped {lifeLost}.',
  'end.lesson.energy': 'Energy is limited and the shadow comes to collect: saving battery matters as much as using it.',

  'problem.antenna': 'Earth out of sight',
  'problem.antenna.where': 'Antenna tower: point it at the satellite',
  'report.problem.failed.antenna': 'Earth went behind the mountains, and nobody pointed the antenna at the satellite: tomorrow no messages arrive.',
  'msg.noSignal': 'No signal! Earth is behind the mountains, and the antenna was not pointed at the satellite.',

  'plan.hint.shield': '+8 per block; loses 4 per day',
  'plan.endSol': 'End the day',
  'day.title': 'Day on the Moon',

  'msg.delay': 'This message arrived in about 1 second',
  'msg.stormAlert': 'Solar storm coming! Class {label} flare. Impact is tomorrow (day {sol}). Reinforce the shielding.',

  'card.mysteryRock.text': 'The rover found a light, shiny rock. It could tell us how the Moon was formed!',
  'card.cargoShip.text': 'A cargo ship is coming from Earth, on a 3-day trip. Only one thing fits: what do you ask for?',
  'card.brokenSensor.text': 'A sensor stopped. Earth knows how to fix it, and from the Moon the answer arrives in seconds.',
  'card.brokenSensor.askEarth': 'Ask Earth for help: science −3 (a very short wait)',
  'card.brokenSensor.lesson': 'On the Moon, Earth answers in 1 second. On Mars, the answer takes minutes, and the crew often has to decide alone.',
  'card.brokenSensor.askEarth.result': 'Earth answered right away. Science was barely delayed.',
  'card.subsurfaceIce.title': 'Ice in the dark crater',
  'card.subsurfaceIce.text': 'Near the base there is a crater where the Sun never shines. There is ice inside, and ice becomes water and air!',
  'card.subsurfaceIce.lesson': 'In 2009, NASA’s LCROSS probe found water ice in a dark crater.',
  'card.roverRoute.text': 'The rover is going to a new rock. The shortcut crosses soft dust at the edge of a crater.',
  'card.roverRoute.lesson': 'Rovers drive slowly and look at the path first, so they do not get stuck in soft dust.',
  'card.roverRoute.stuck': 'The dust was soft and the rover got stuck! Send someone to rescue it today.',

  'report.title': 'Day {sol} report',
  'report.next': 'Start day {sol}',
  'report.night': 'Night on the Moon…',

  'end.won.text': 'The crew made it safely to the end of day {sol}.',
  'end.lost.life.text': 'On day {sol}, life support reached zero: the crew ran out of air, water or food. Without enough energy, the base cannot keep the crew alive.',
  'end.lost.dose.text': 'On day {sol}, the radiation dose reached 100. With no air and no shielding, solar storms hit hard on the Moon.',
  'end.star1': 'Survived the 15 days',
  'end.lesson.shield': 'With no air, the Moon protects nothing: shielding matters even more than on Mars.',
  'end.lesson.delay': 'Earth is close: from the Moon, messages arrive in about 1 second. On Mars, they take 3 to 22 minutes!',

  'tutorial.1.text': 'Your crew lives at the Moon’s south pole, near Shackleton Crater, for 15 days.',
  'tutorial.2.text': 'Every day the panels give energy blocks: the more Sun, the more blocks. You split them between life support, shielding and science. What is left goes to the battery, which the base uses while everyone sleeps.',
  'tutorial.3.text': 'Earth warns you when a solar storm is coming. Reinforce the shielding first! Sometimes the mountains cast shadows for days: save battery. During the day, problems appear around the base: send an astronaut to fix them.',

  'data.donki.use': 'Each solar storm in the game uses a real solar flare recorded by NASA, with its date and class (M = medium, X = strong). The dose in the game is our own scale, not a measurement on the Moon.',
  'data.rad.name': 'LND: radiation measured on the ground on the Moon',
  'data.rad.badge': 'measured in 2019',
  'data.rad.use': 'China’s Chang’e 4 lander measured about 1.4 mSv of radiation per day on the Moon’s surface, about 2 times what the Curiosity rover measured on Mars. The game’s dose is a different scale.',
  'data.rad.link': 'https://doi.org/10.1126/sciadv.aaz1334',
  'data.radlab.use': 'Coming soon: real measurements taken on the ISS, in Earth orbit (not on the Moon).',
  'data.marstrek.name': 'Moon Trek: Moon terrain',
  'data.marstrek.use': 'Coming soon: the real terrain of the lunar south pole. Today the terrain is made by the game.',
  'data.marstrek.link': 'https://trek.nasa.gov/moon/',

  'scene.loadingPhysics': 'Loading Moon physics…',
  'crew.fact.gravity': 'On the Moon gravity is only 1/6 of Earth’s: the same jump goes about 6 times higher!',
  'crew.fact.source': 'Source: NASA',
};

export const MOON_STRINGS = { pt, en } as const;
