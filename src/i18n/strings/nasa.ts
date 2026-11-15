/**
 * Dados da NASA: fontes, erupções e tempestades reais, missões históricas e fatos científicos (fonte em docs/ciencia-marte.md).
 * Linguagem para 7–12 anos: frases curtas, palavras do dia a dia (docs/publico-e-impacto.md).
 * Parâmetros entre chaves: {n}. Toda chave precisa existir nos dois idiomas (o TypeScript confere).
 */
export const pt = {
  'fact.exercise.title': '💪 Hora de malhar!',
  'fact.exercise': 'Astronautas fazem exercício todo dia, umas 2 horas. Assim os ossos e os músculos ficam fortes.',
  'fact.greenhouseInflatable.title': '🌱 Estufa de encher',
  'fact.greenhouseInflatable': 'A NASA estuda uma estufa que enche igual a um balão. A luz do Sol chega por fibra óptica (cabos de luz).',
  'flare.real': 'Erupção real: {date}',
  'flare.simulated': 'Erupção simulada',
  'flare.real.cme': 'Tempestade real: {date}',
  'storm.strength.C': 'fraca',
  'storm.strength.M': 'média',
  'storm.strength.X': 'forte',
  'mission.start': 'Seus 15 sóis começam em {date}. As tempestades do Sol e o tempo das mensagens são reais.',
  'mission.title': '📅 Sua missão',
  'mission.go': 'Começar',
  'fact.battery': '💡 O rover Perseverance também usa baterias nos momentos de mais gasto.',
  'fact.opportunity': '💡 Em 2018, uma tempestade de poeira assim desligou o rover Opportunity.',
  'fact.spirit': '💡 Em 2009, o rover Spirit atolou na areia de Marte. Ele nunca mais saiu.',
  'fact.tubes': '💡 O rover Perseverance levou só 38 tubos para guardar amostras. Cada amostra é do tamanho de um giz.',
  'fact.moon.sun': '💡 Na Lua, o Sol é mais que o dobro do de Marte. No polo, ele passa baixinho, atrás dos morros.',
  'fact.moon.relay': '💡 No polo sul, a Terra fica baixinha e some atrás das montanhas. Por isso a NASA planeja satélites para levar as mensagens.',
  'fact.moon.radiation': '💡 A sonda Chang’e 4 mediu o dobro da radiação de Marte. Na Lua não há ar para proteger.',
  'fact.moon.shadow': '💡 No polo sul da Lua, o Sol fica sempre baixinho no horizonte. Montanhas e crateras fazem sombra, às vezes por dias.',
  'fact.moon.lunokhod': '💡 Em 1973, o rover Lunokhod 2 se cobriu de poeira numa cratera. Ele esquentou demais e parou.',
} as const;

export const en: Record<keyof typeof pt, string> = {
  'fact.exercise.title': '💪 Workout time!',
  'fact.exercise': 'Astronauts exercise every day, for about 2 hours. That way, their bones and muscles stay strong.',
  'fact.greenhouseInflatable.title': '🌱 A blow-up greenhouse',
  'fact.greenhouseInflatable': 'NASA is studying a greenhouse that fills up like a balloon. Sunlight comes in through optical fibers (light cables).',
  'flare.real': 'Real flare: {date}',
  'flare.simulated': 'Simulated flare',
  'flare.real.cme': 'Real storm: {date}',
  'storm.strength.C': 'weak',
  'storm.strength.M': 'medium',
  'storm.strength.X': 'strong',
  'mission.start': 'Your 15 sols start on {date}. The Sun’s storms and message times are real.',
  'mission.title': '📅 Your mission',
  'mission.go': 'Start',
  'fact.battery': '💡 The Perseverance rover also uses batteries when it needs extra power.',
  'fact.opportunity': '💡 In 2018, a dust storm like this shut down the Opportunity rover.',
  'fact.spirit': '💡 In 2009, the Spirit rover got stuck in Martian sand. It never got out.',
  'fact.tubes': '💡 The Perseverance rover carried only 38 tubes for samples. Each sample is the size of a piece of chalk.',
  'fact.moon.sun': '💡 Moon sunlight is over twice as strong as on Mars. At the pole, the Sun stays low, behind the hills.',
  'fact.moon.relay': '💡 At the south pole, Earth stays low and hides behind the mountains. That is why NASA plans satellites to carry messages.',
  'fact.moon.radiation': '💡 The Chang’e 4 lander measured twice Mars’s radiation on the Moon. There is no air to protect you.',
  'fact.moon.shadow': '💡 At the Moon’s south pole, the Sun always stays low. Mountains and craters cast shadows, sometimes for days.',
  'fact.moon.lunokhod': '💡 In 1973, the Lunokhod 2 rover got covered in crater dust. It overheated and stopped.',
};
