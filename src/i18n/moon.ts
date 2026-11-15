import type { StringKey } from './strings';

/**
 * Textos da base lunar (docs/game-design.md, "Base lunar"): substituem os de Marte quando a base fica na Lua.
 * Só entram aqui as chaves que MUDAM; o resto vem de src/i18n/strings/. Na Lua o turno é um dia da Terra, não um sol.
 * Toda chave precisa existir nos dois idiomas (o TypeScript confere).
 */
const pt = {
  'game.title': 'Artemis Quest',
  'game.subtitle': 'Moon Base · Polo sul da Lua',
  'top.sol': 'Dia {sol} de {total}',

  'help.life': 'Ar, água e comida da tripulação. Precisa de 3 blocos por dia para ficar estável. Se chegar a 0, a missão acaba.',
  'help.shield': 'A blindagem são sacos de regolito (terra da Lua) no abrigo. Cada bloco de energia move as máquinas que enchem mais sacos. Ela se desgasta um pouco todo dia.',
  'help.dose': 'Dose é quanta radiação a tripulação já recebeu. Na Lua não há ar para proteger. Ela sobe o dobro de Marte todo dia. Em 100, a tripulação precisa voltar para a Terra. Este número é uma escala do jogo, não uma medição real.',
  'help.sol': 'Na base lunar contamos os dias da Terra (24 horas). Um dia inteiro da Lua dura 29 dias e meio da Terra!',
  'help.dust': 'Poeira cobre os painéis solares e diminui a energia. Na Lua não há vento. A poeira só sai se um astronauta limpar.',
  'help.battery': 'A bateria guarda a energia que sobra. Enquanto a tripulação dorme, a base gasta 15. Na sombra faz muito frio, e os aquecedores gastam 30.',

  'plan.hint.battery': '+10 por bloco; até amanhã a base gasta {cost}',
  'preview.tonight': 'até amanhã:',
  'preview.afterNight': 'amanhã cedo:',
  'preview.batteryShort': '⚠️ A bateria vai acabar antes de amanhã: suporte de vida −{life}. Guarde mais blocos!',
  'preview.stormTonight': '🌩️ Tempestade solar classe {label} hoje. Com blindagem {shield}, a dose sobe +{dose}.',
  'preview.stormTomorrow': '📡 Amanhã vem tempestade classe {label}. Com a blindagem de hoje ({shield}), a dose seria +{dose}.',
  'preview.allGood': '✅ Com este plano, a base chega bem até amanhã.',
  'day.remaining': '{s} s até a hora de dormir',
  'msg.stormToday': 'A tempestade solar (classe {label}) chega hoje. Última chance de reforçar a blindagem!',
  'report.night.ok': 'A tripulação dormiu. A base gastou {cost} de bateria com ar, água e computadores.',
  'report.night.short': 'A bateria acabou antes de amanhã! Faltaram {missing} e o suporte de vida caiu {lifeLost}.',
  'end.lesson.energy': 'A energia é limitada, e a sombra cobra a conta. Guardar bateria importa tanto quanto usar.',

  'problem.antenna': 'Terra escondida',
  'problem.antenna.where': 'Torre da antena: apontar para o satélite',
  'report.problem.failed.antenna': 'A Terra sumiu atrás das montanhas. Ninguém apontou a antena para o satélite. Amanhã as mensagens não chegam.',
  'msg.noSignal': 'Sem sinal! A Terra está atrás das montanhas. A antena não foi apontada para o satélite.',

  'plan.hint.shield': '+8 por bloco; perde 4 por dia',
  'plan.endSol': 'Terminar o dia',
  'day.title': 'Dia na Lua',

  'msg.delay': 'A mensagem chegou em cerca de 1 segundo',
  'msg.stormAlert': 'Tempestade solar a caminho! Erupção classe {label}. O impacto é amanhã (dia {sol}). Reforcem a blindagem.',

  'card.mysteryRock.text': 'O rover achou uma rocha clara e brilhante. Ela pode contar como a Lua se formou!',
  'card.cargoShip.text': 'Uma nave de carga vem da Terra, numa viagem de 3 dias. Só cabe uma coisa: o que vocês pedem?',
  'card.brokenSensor.text': 'Um sensor parou. A Terra sabe consertar. Daqui da Lua, a resposta chega em segundos.',
  'card.brokenSensor.askEarth': 'Pedir ajuda à Terra: ciência −3 (a espera é curtinha)',
  'card.brokenSensor.lesson': 'Na Lua, a Terra responde em 1 segundo. Em Marte, a resposta leva minutos. Lá, a equipe muitas vezes decide sozinha.',
  'card.brokenSensor.askEarth.result': 'A Terra respondeu na hora. A ciência quase não atrasou.',
  'card.subsurfaceIce.title': 'Gelo na cratera escura',
  'card.subsurfaceIce.text': 'Perto da base há uma cratera onde o Sol nunca bate. Lá dentro tem gelo, e gelo vira água e ar!',
  'card.subsurfaceIce.lesson': 'Em 2009, a sonda LCROSS, da NASA, achou gelo de água. Ele estava numa cratera escura.',
  'card.roverRoute.text': 'O rover vai até uma rocha nova. O atalho passa pela poeira fofa da borda de uma cratera.',
  'card.roverRoute.lesson': 'Rovers andam devagar e olham o caminho antes. Assim não atolam na poeira fofa.',
  'card.roverRoute.stuck': 'A poeira era fofa e o rover atolou! Mandem alguém resgatar hoje.',

  'report.title': 'Relatório do dia {sol}',
  'report.next': 'Começar o dia {sol}',
  'report.night': 'Noite na Lua…',

  'end.won.text': 'A tripulação chegou ao fim do dia {sol} em segurança.',
  'end.lost.life.text': 'No dia {sol}, o suporte de vida chegou a zero. Faltou ar, água ou comida. Sem energia suficiente, a base não mantém a tripulação.',
  'end.lost.dose.text': 'No dia {sol}, a dose de radiação chegou a 100. Sem ar e sem blindagem, as tempestades solares pesam muito na Lua.',
  'end.star1': 'Sobreviveu aos 15 dias',
  'end.lesson.shield': 'A Lua não tem ar para proteger. A blindagem importa ainda mais que em Marte.',
  'end.lesson.delay': 'A Terra está perto. Da Lua, as mensagens chegam em cerca de 1 segundo. Em Marte, levam de 3 a 22 minutos!',

  'tutorial.1.text': 'Sua tripulação vive no polo sul da Lua por 15 dias. A base fica perto da cratera Shackleton.',
  'tutorial.2.text': 'Todo dia, os painéis dão blocos de energia. Quanto mais Sol, mais blocos. Você divide entre suporte de vida, blindagem e ciência. O que sobrar vai para a bateria. A base gasta a bateria enquanto todos dormem.',
  'tutorial.3.text': 'A Terra avisa quando vem uma tempestade solar. Reforce a blindagem antes! Às vezes as montanhas fazem sombra por dias: guarde bateria. Durante o dia, problemas aparecem pela base. Mande um astronauta consertar.',

  'data.donki.use': 'Cada tempestade solar do jogo usa uma erupção real registrada pela NASA. Ela tem data e classe: M = média, X = forte. A dose do jogo é uma escala nossa, não medida na Lua.',
  'data.rad.name': 'LND: radiação medida no chão da Lua',
  'data.rad.badge': 'medido em 2019',
  'data.rad.use': 'A sonda chinesa Chang’e 4 mediu a radiação no chão da Lua. Foram uns 1,4 mSv por dia. É cerca de 2 vezes o que o Curiosity mediu em Marte. A dose do jogo é uma escala diferente.',
  'data.rad.link': 'https://doi.org/10.1126/sciadv.aaz1334',
  'data.radlab.use': 'Em breve: medições reais feitas na ISS, em órbita da Terra. Não são da Lua.',
  'data.marstrek.name': 'Moon Trek: relevo da Lua',
  'data.marstrek.use': 'Em breve: o terreno real do polo sul da Lua. Hoje o terreno é gerado pelo jogo.',
  'data.marstrek.link': 'https://trek.nasa.gov/moon/',

  'scene.loadingPhysics': 'Carregando a física da Lua…',
  'crew.fact.gravity': 'Na Lua, você pesa bem menos do que na Terra. O mesmo pulo vai umas 6 vezes mais alto!',
  'crew.fact.source': 'Fonte: NASA',

  // Treino dos dias 1 a 3 (src/i18n/strings/intro.ts): na Lua não há tempestade de poeira; o treino é a sombra.
  'intro.badge': '🎓 Treino · dia {sol} de 3',
  'intro.1.base.text': 'Ela fica no polo sul da Lua. A tripulação mora lá dentro.',
  'intro.1.night.title': '😴 Hora de dormir: a bateria',
  'intro.1.night.text': 'Enquanto todos dormem, a base gasta a energia guardada na bateria.',
  'intro.2.earth.text': 'A antena recebe mensagens da Terra. Da Lua, elas chegam em cerca de 1 segundo!',
  'intro.2.far.title': '🌍 A Terra está perto',
  'intro.2.far.text': 'Da Lua, a resposta chega na hora. Em Marte, ela leva minutos.',
  'intro.2.battery.title': '🔋 Guarde para a hora de dormir',
  'intro.2.battery.text': 'O que sobra do dia vai para a bateria. Até amanhã, a base gasta {cost}.',
  'intro.3.dust.title': '🌑 Treino: sombra das montanhas',
  'intro.3.dust.text': 'No polo sul, as montanhas fazem sombra, às vezes por dias. Menos Sol, menos energia.',
  'intro.3.end.text': 'Foi só um treino: nada mudou na base. A partir do dia 4, é para valer!',
} as const satisfies Partial<Record<StringKey, string>>;

const en: Record<keyof typeof pt, string> = {
  'game.title': 'Artemis Quest',
  'game.subtitle': 'Moon Base · Lunar south pole',
  'top.sol': 'Day {sol} of {total}',

  'help.life': 'Air, water and food for the crew. It needs 3 blocks per day to stay steady. If it reaches 0, the mission ends.',
  'help.shield': 'Shielding is bags of regolith (Moon soil) around the shelter. Each energy block runs the machines that fill more bags. It wears down a little every day.',
  'help.dose': 'Dose is how much radiation the crew has received. The Moon has no air to protect you. It goes up twice as much as on Mars every day. At 100, the crew must go back to Earth. This number is a game scale, not a real measurement.',
  'help.sol': 'At the Moon base we count Earth days (24 hours). A whole Moon day lasts 29 and a half Earth days!',
  'help.dust': 'Dust covers the solar panels and lowers the energy. The Moon has no wind. Dust only comes off if an astronaut cleans it.',
  'help.battery': 'The battery stores leftover energy. While the crew sleeps, the base uses 15. In the shadow it is very cold, and the heaters use 30.',

  'plan.hint.battery': '+10 per block; until tomorrow the base uses {cost}',
  'preview.tonight': 'until tomorrow:',
  'preview.afterNight': 'tomorrow morning:',
  'preview.batteryShort': '⚠️ The battery will run out before tomorrow: life support −{life}. Save more blocks!',
  'preview.stormTonight': '🌩️ Solar storm, class {label}, today. With shielding at {shield}, the dose goes up +{dose}.',
  'preview.stormTomorrow': '📡 A class {label} storm comes tomorrow. With today’s shielding ({shield}), the dose would be +{dose}.',
  'preview.allGood': '✅ With this plan, the base gets to tomorrow fine.',
  'day.remaining': '{s} s until bedtime',
  'msg.stormToday': 'The solar storm (class {label}) arrives today. Last chance to reinforce the shielding!',
  'report.night.ok': 'The crew slept. The base used {cost} battery for air, water and computers.',
  'report.night.short': 'The battery ran out before tomorrow! {missing} was missing and life support dropped {lifeLost}.',
  'end.lesson.energy': 'Energy is limited, and the shadow comes to collect. Saving battery matters as much as using it.',

  'problem.antenna': 'Earth out of sight',
  'problem.antenna.where': 'Antenna tower: point it at the satellite',
  'report.problem.failed.antenna': 'Earth went behind the mountains. Nobody pointed the antenna at the satellite. Tomorrow no messages arrive.',
  'msg.noSignal': 'No signal! Earth is behind the mountains. The antenna was not pointed at the satellite.',

  'plan.hint.shield': '+8 per block; loses 4 per day',
  'plan.endSol': 'End the day',
  'day.title': 'Day on the Moon',

  'msg.delay': 'This message arrived in about 1 second',
  'msg.stormAlert': 'Solar storm coming! Class {label} flare. Impact is tomorrow (day {sol}). Reinforce the shielding.',

  'card.mysteryRock.text': 'The rover found a light, shiny rock. It could tell us how the Moon was formed!',
  'card.cargoShip.text': 'A cargo ship is coming from Earth, on a 3-day trip. Only one thing fits: what do you ask for?',
  'card.brokenSensor.text': 'A sensor stopped. Earth knows how to fix it. From the Moon, the answer arrives in seconds.',
  'card.brokenSensor.askEarth': 'Ask Earth for help: science −3 (a very short wait)',
  'card.brokenSensor.lesson': 'On the Moon, Earth answers in 1 second. On Mars, the answer takes minutes. There, the crew often has to decide alone.',
  'card.brokenSensor.askEarth.result': 'Earth answered right away. Science was barely delayed.',
  'card.subsurfaceIce.title': 'Ice in the dark crater',
  'card.subsurfaceIce.text': 'Near the base there is a crater where the Sun never shines. There is ice inside, and ice becomes water and air!',
  'card.subsurfaceIce.lesson': 'In 2009, NASA’s LCROSS probe found water ice in a dark crater.',
  'card.roverRoute.text': 'The rover is going to a new rock. The shortcut crosses soft dust at the edge of a crater.',
  'card.roverRoute.lesson': 'Rovers drive slowly and look at the path first. That way they do not get stuck in soft dust.',
  'card.roverRoute.stuck': 'The dust was soft and the rover got stuck! Send someone to rescue it today.',

  'report.title': 'Day {sol} report',
  'report.next': 'Start day {sol}',
  'report.night': 'Night on the Moon…',

  'end.won.text': 'The crew made it safely to the end of day {sol}.',
  'end.lost.life.text': 'On day {sol}, life support reached zero. The crew ran out of air, water or food. Without enough energy, the base cannot keep the crew alive.',
  'end.lost.dose.text': 'On day {sol}, the radiation dose reached 100. With no air and no shielding, solar storms hit the Moon hard.',
  'end.star1': 'Survived the 15 days',
  'end.lesson.shield': 'The Moon has no air to protect you. Shielding matters even more than on Mars.',
  'end.lesson.delay': 'Earth is close: from the Moon, messages arrive in about 1 second. On Mars, they take 3 to 22 minutes!',

  'tutorial.1.text': 'Your crew lives at the Moon’s south pole for 15 days. The base is near Shackleton Crater.',
  'tutorial.2.text': 'Every day, the panels give energy blocks. The more Sun, the more blocks. You split them between life support, shielding and science. What is left goes to the battery. The base uses it while everyone sleeps.',
  'tutorial.3.text': 'Earth warns you when a solar storm is coming. Reinforce the shielding first! Sometimes the mountains cast shadows for days: save battery. During the day, problems appear around the base. Send an astronaut to fix them.',

  'data.donki.use': 'Each game solar storm uses a real flare recorded by NASA. It has a date and a class: M = medium, X = strong. The game’s dose is our own scale, not measured on the Moon.',
  'data.rad.name': 'LND: radiation measured on the ground on the Moon',
  'data.rad.badge': 'measured in 2019',
  'data.rad.use': 'China’s Chang’e 4 lander measured radiation on the Moon’s surface. It was about 1.4 mSv per day. That is about 2 times what Curiosity measured on Mars. The game’s dose is a different scale.',
  'data.rad.link': 'https://doi.org/10.1126/sciadv.aaz1334',
  'data.radlab.use': 'Coming soon: real measurements taken on the ISS, in Earth orbit. They are not from the Moon.',
  'data.marstrek.name': 'Moon Trek: Moon terrain',
  'data.marstrek.use': 'Coming soon: the real terrain of the lunar south pole. Today the terrain is made by the game.',
  'data.marstrek.link': 'https://trek.nasa.gov/moon/',

  'scene.loadingPhysics': 'Loading Moon physics…',
  'crew.fact.gravity': 'On the Moon, you weigh much less than on Earth. The same jump goes about 6 times higher!',
  'crew.fact.source': 'Source: NASA',

  'intro.badge': '🎓 Training · day {sol} of 3',
  'intro.1.base.text': 'It is at the Moon’s south pole. The crew lives inside.',
  'intro.1.night.title': '😴 Bedtime: the battery',
  'intro.1.night.text': 'While everyone sleeps, the base uses the energy stored in the battery.',
  'intro.2.earth.text': 'The antenna gets messages from Earth. From the Moon, they arrive in about 1 second!',
  'intro.2.far.title': '🌍 Earth is close',
  'intro.2.far.text': 'From the Moon, answers arrive right away. On Mars, they take minutes.',
  'intro.2.battery.title': '🔋 Save some for bedtime',
  'intro.2.battery.text': 'What is left from the day goes to the battery. Until tomorrow, the base uses {cost}.',
  'intro.3.dust.title': '🌑 Training: mountain shadow',
  'intro.3.dust.text': 'At the south pole, mountains cast shadows, sometimes for days. Less Sun means less energy.',
  'intro.3.end.text': 'It was only training: nothing changed in the base. From day 4 on, it is for real!',
};

export const MOON_STRINGS = { pt, en } as const;
