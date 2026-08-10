# 🦄 Enhörningsängen

Ett lugnt sidscrollande spel med enhörningar, gjort för barn.
Man går åt vänster och höger, flyger upp och ner, samlar glitter och
får med sig andra enhörningar i ett långt tåg. Man kan inte förlora,
och ängen tar aldrig slut.

## Så spelar man

Öppna `index.html` i webbläsaren — det är allt. Inget att installera,
ingen internetuppkoppling, inga bildfiler.

| Styrning | Tangentbord | Pekskärm |
| --- | --- | --- |
| Gå åt vänster / höger | ← → eller A / D | knapparna nere till vänster |
| Flyg upp | ↑, W eller mellanslag | knappen nere till höger |
| Dyk ner | ↓ eller S | knappen nere till höger |

* ✨ **Glitter** ger 1 poäng, 💗 **hjärtan** och 🎈 **ballonger** ger 3.
* Gå fram till en annan enhörning så följer den med dig resten av spelet.
* Knappen 🎲 på startskärmen slumpar fram en ny enhörning.

Vill man köra det från en server (t.ex. för att spela på surfplattan i
samma nätverk) räcker det med:

```sh
python3 -m http.server 8000
```

…och sedan surfa till `http://<datorns-ip>:8000`.

## Hur det är byggt

Ren HTML, CSS och JavaScript utan bibliotek eller byggsteg. Allt ritas
med canvas 2D, så det finns inga bilder att ladda och allt blir skarpt
på alla skärmar.

| Fil | Innehåll |
| --- | --- |
| `js/rng.js` | Deterministisk slumpgenerator. Samma frö → samma enhörning och samma äng. |
| `js/unicorn.js` | Slumpar fram och ritar en enhörning: färger, fläckar, man, svans och horn. |
| `js/world.js` | Himmel, moln, kullar, mark och allt som växer och flyter i den. |
| `js/game.js` | Spelslingan: styrning, fysik, kamera, upplockning och kompiståget. |

Enhörningarna är ritade efter en bilderbok, och de fyra hornsorterna
kommer därifrån: **spiralhorn**, **slätt horn**, **trapphorn** och
**böjt horn**.

Världen är oändlig åt båda hållen. Marken är en matematisk kurva och
innehållet slumpas fram i bitar om 640 pixlar med bitens nummer som frö
— därför ser samma ställe likadant ut varje gång man går tillbaka dit,
utan att något behöver sparas.
