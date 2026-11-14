package sim

import "math"

// Cards espelha src/sim/cards.ts. Regra: TODA opção tem custo.
var Cards = map[CardID]Card{
	"dustyPanels":    {ID: "dustyPanels", Options: []CardOption{{"clean"}, {"wait"}}},
	"mysteryRock":    {ID: "mysteryRock", Options: []CardOption{{"sendRover"}, {"skip"}}},
	"greenhouseLeak": {ID: "greenhouseLeak", Options: []CardOption{{"fixNow"}, {"fixLater"}}},
	"cargoShip":      {ID: "cargoShip", Options: []CardOption{{"batteries"}, {"shieldKit"}, {"experiment"}}},
	"brokenSensor":   {ID: "brokenSensor", Options: []CardOption{{"askEarth"}, {"fixAlone"}}},
	"subsurfaceIce":  {ID: "subsurfaceIce", Options: []CardOption{{"drill"}, {"notNow"}}},
}

// CardIDs na MESMA ordem de Object.keys(CARDS) no TS (o embaralhamento depende dela).
var CardIDs = []CardID{"dustyPanels", "mysteryRock", "greenhouseLeak", "cargoShip", "brokenSensor", "subsurfaceIce"}

func onCardDrawn(id CardID, res *Resources) {
	if id == "dustyPanels" {
		res.Dust = math.Min(Config.DustMax, res.Dust+25)
	}
}

func applyCardOption(id CardID, option string, res *Resources, rng *Rng) []ReportLine {
	var lines []ReportLine
	add := func(field *float64, max, delta float64) { *field = clamp(*field+delta, 0, max) }
	inf := math.Inf(1)

	switch string(id) + ":" + option {
	case "dustyPanels:clean":
		add(&res.Dust, Config.DustMax, -30)
		add(&res.Dose, inf, 4)
	case "mysteryRock:sendRover":
		add(&res.Science, inf, 15)
		add(&res.Battery, Config.BatteryMax, -20)
	case "greenhouseLeak:fixNow":
		add(&res.Battery, Config.BatteryMax, -15)
		add(&res.Science, inf, -5)
	case "greenhouseLeak:fixLater":
		add(&res.Life, Config.LifeMax, -15)
	case "cargoShip:batteries":
		add(&res.Battery, Config.BatteryMax, 30)
	case "cargoShip:shieldKit":
		add(&res.Shield, Config.ShieldMax, 30)
	case "cargoShip:experiment":
		add(&res.Science, inf, 15)
	case "brokenSensor:askEarth":
		add(&res.Science, inf, -10)
	case "brokenSensor:fixAlone":
		if rng.Chance(0.5) {
			add(&res.Battery, Config.BatteryMax, -20)
			lines = append(lines, ReportLine{Key: "card.brokenSensor.failed", Tone: "bad"})
		} else {
			lines = append(lines, ReportLine{Key: "card.brokenSensor.worked", Tone: "good"})
		}
	case "subsurfaceIce:drill":
		add(&res.Battery, Config.BatteryMax, -20)
		add(&res.Life, Config.LifeMax, 20)
	}
	return append([]ReportLine{{Key: "card." + string(id) + "." + option + ".result"}}, lines...)
}
