# Amsterdam op de kaart

## De Amsterdam Time Machine Data Index

De Amsterdam Time Machine biedt een platform voor locatiegebonden
toegang tot historische informatie over de stad Amsterdam zoals deze
vorm kreeg in de afgelopen eeuwen, in voortdurende interactie met alle
mensen die er woonden, werkten en verbleven. Deze kaartapplicatie
fungeert als toegang tot de diverse databronnen van Amsterdamse en
nationale erfgoedinstellingen die beschikbaar zijn als Linked Open Data
of zijn ontstaan in de context van de verschillende Amsterdam Time
Machine pilotprojecten. De kaart biedt een index van de beschikbare
data, die via locatie en tijd zichtbaar kunnen worden gemaakt en waarin
gebruikers kunnen grasduinen om te zien wat we weten over de
geschiedenis van die plek.

Deze kaart is een eerste ontwerp van de 'voordeur' van de Amsterdam Time
Machine en zal in de komende jaren worden verrijkt met nieuwe data en
functionaliteiten. Het is géén plek om eigen data te verzamelen en te
downloaden, maar ontworpen als index om een indruk te krijgen van welke
data er beschikbaar zijn en daar zelf nieuwe onderzoeksvragen over te
kunnen ontwikkelen. Stap binnen in de Amsterdam Time Machine door deze
nieuwe voordeur en ontdek de mogelijkheden van in ruimte en tijd
ontsloten historische bronnen voor historisch onderzoek en andere
toepassingen in de erfgoedsector, in de publiek-private sector en door
het brede publiek.

## Waarom doen we dit?

Als je historisch onderzoek doet, ontdek je al snel dat iedere
erfgoedinstelling zijn eigen datasets beheert en toegankelijk maakt, wat
betekent dat onderzoekers meerdere archieven moeten raadplegen en
verschillende databases moeten doorzoeken. Traditionele interfaces
vereisen dat gebruikers van tevoren weten waar ze naar op zoek zijn. Dat
kan een barrière vormen, wanneer je niet precies weet wat er beschikbaar
is. Deze uitdaging leidde ertoe dat we een alternatieve benadering
hebben gezocht: in plaats van data te gebruiken om verhalen te
vertellen, bieden we met de nieuwe kaartinterface een data index,
waarmee de beschikbaarheid en geschiedenis van de data zelf worden
belicht.

De kaart dient als een centrale ingang waarmee digitale databronnen van
verschillende instellingen voor cultureel erfgoed en historische bronnen
tegelijk te doorzoeken zijn. Er is een directe koppeling naar de
originele bronnen om die in context te kunnen bekijken en meer
informatie op te halen. De Amsterdam Time Machine legt daarmee een link
tussen locatie op de kaart en de bronnen die in de dataruimtes van de
verschillende instellingen bewaard en beschreven zijn.

## De kaart

Voor de weergave van de plattegrond van de stad is een grafische kaart
gebruikt die Amsterdam anno 2025 weergeeft (OpenStreetMap data via
MapTiler, Web Mercator projectie). Dit vanuit het idee dat zoeken op een
kaart begint vanuit de actuele parate kennis van de gebruiker van de
lay-out van de stad. Oudere kaarten van Amsterdam zullen op termijn
toegevoegd worden, als deze via het Amsterdam Time Machine pilotproject
met de kaartencollectie van Allard Pierson beschikbaar zijn gemaakt.
Hiermee kunnen we groei en ontwikkeling van de stad door de eeuwen heen
visualiseren.

De interface verdeelt Amsterdam in tegels ter grootte van een buurt op
een vaste geografische 'hittekaart', met een tijdlijn die zich uitstrekt
van de 17e eeuw tot nu in perioden van 50 jaar. Zowel de ruimtelijke
'hittekaart' als de tijdlijn geven de gegevensdichtheid weer op
logaritmische schalen. Elke tegel op de kaart biedt een momentopname van
historische data van die buurt in de gegeven periode, zoals die
momenteel beschikbaar zijn via de Amsterdam Time Machine.

Over de kaart van Amsterdam ligt een raster van blokjes. Hoe blauwer een
blokje kleurt, hoe meer data er over een bepaald deel van Amsterdam te
vinden is. Klik op een blokje en je krijgt aan de rechterkant van het
scherm een overzicht van de beschikbare data.

![Kaartweergave](/images/map.png "Screenshot van de kaartweergave")

## Hoe werkt deze data index?

In de data index kan op verschillende manieren gezocht worden:

- ruimtelijk (via de kaart, door het aanklikken van de blauwe tegels),
- temporeel (door de tijd heen, via de tijdbalk)
- op type data (aan- of uitvinken van beeld, persoon, of tekst)
- thematisch (via door machine learning gegenereerde
  onderwerpclassificaties die aan- en uitgevinkt kunnen worden om de
  resultaten te filteren)

Om te beginnen met zoeken, klik je op de blauwe tegels op de kaart van
Amsterdam om gegevens uit dat gebied weer te geven. Aan de rechterkant
van het scherm worden vervolgens de beschikbare afbeeldingen, teksten en
personen samen weergegeven in een uitklapvenster.

![Een voorbeeld van de dataweergave](/images/app.png "Screenshot van een voorbeeld van de dataweergave")

Onder aan het scherm is een tijdlijn te vinden die loopt van 1500 tot
heden, verdeeld in blokken van telkens 50 jaar. Via deze tijdlijn is het
mogelijk data uit een bepaalde tijdsperiode te selecteren. Als je
bijvoorbeeld een cel in de Jordaan selecteert voor de periode 1900-1950,
kunnen foto\'s van arbeiderswoningen worden getoond naast
krantenartikelen over stakingen.

De omvang van het blauwe blokje in de tijdlijn correspondeert met de
hoeveelheid data: hoe hoger het blokje, hoe meer data er uit deze
periode te vinden zijn. Geen blauwe tegel betekent: voor deze locaties
zijn nog geen data beschikbaar in de Amsterdam Time Machine.

![De tijdlijn](/images/timeline.png "Screenshot van de tijdlijnweergave")

De data index biedt via een keuzemenu toegang tot 3 typen data: beeld,
tekst en persoon. Deze categorieën zijn naar wens aan of uit te vinken
om in de zoekactie mee te nemen of van de zoekactie uit te sluiten.

![Keuzemenu datatype](/images/filters.png "Screenshot van het keuzemenu voor datatype")

Daarnaast is een aantal thema's uit het stedelijk leven geïdentificeerd
op basis waarvan de data gefilterd kan worden. Dit zijn:

- natuur/dieren/katten
- wonen/huizen
- mobiliteit/verkeer/wielen

Deze categorieën zijn verre van compleet, maar geven een indruk van de
manier waarop je met *machine learning* en andere AI-technieken bronnen
automatisch kunt voorzien van extra beschrijvingen die ze beter vindbaar
en doorzoekbaar maken. Thematische categorieën kunnen desgewenst aan- of
uitgevinkt worden om bepaalde thema's in de zoekopdracht mee te nemen of
uit te sluiten.

Op deze wijze worden thematische verbanden gelegd tussen de databronnen
die anders niet zichtbaar zijn. Hiermee fungeert de Amsterdam Time
Machine data index als een heuristische tool om nieuwe onderzoeksvragen
te ontwikkelen. Let op: dit classificatiesysteem is nog experimenteel en
de nauwkeurigheid ervan is nog niet getoetst en gevalideerd; eventuele
foute identificaties zijn expres in stand gelaten om zichtbaar te maken
dat automatisch gegenereerde beschrijvingen ook beperkingen kennen.

De data index laat ook zien wat we nog niet weten. De 'onbetegelde'
gebieden en de gegevensdichtheid (lichter of donkerderblauwe tegels)
roepen vragen op over de beschikbare data als gevolg van
verzamelpraktijken, institutionele prioriteiten in de ontsluiting en
mogelijke vooroordelen in historische documentatie. Waarom worden
bepaalde buurten uitgebreid gedocumenteerd en blijven andere leeg?
Waarom zijn er meer beelden en teksten dan bronnen over personen? In
deze zin nodigt de Amsterdam Time Machine data index ook uit tot een
kritische blik op data en digitalisering en de relatie van die bronnen
met de historische werkelijkheid.

Beschikbare databronnen:

Op dit moment zijn de volgende bronnen doorzoekbaar:

- Een deel van de **beeldbank** van het Stadsarchief Amsterdam
- Krantenbank **Delpher** (met AI doorzocht op bronnen waarbij een
  straatnaam en huisnummer genoemd wordt)
- **Joods monument** uit **Aan het juiste adres**

De huidige datasets beslaan de 17de eeuw tot heden en bevatten
persoonsgegevens, kranten- en tijdschriftartikelen,
architectuurtekeningen en historische foto's. Er is een kleine selectie
gemaakt uit beschikbare datasets om een eerste *proof of concept* te
maken. Andere datasets zullen in de loop van de tijd worden toegevoegd,
om te beginnen met de datasets uit de Amsterdam Time Machine
pilotprojecten (zie
[www.amsterdamtimemachine.nl](http://www.amsterdamtimemachine.nl) en
<https://zenodo.org/communities/atm/>).

## Wat je ziet is wat je krijgt

De data index geeft toegang tot data door direct te linken naar het
gedigitaliseerde object zoals dat in de collecties van de
erfgoedinstellingen wordt bewaard, beschreven en gepresenteerd. Er wordt
geen curatie gedaan of contextualisering toegevoegd, wat betekent dat
alle digitaliserings-, OCR- of metadata-omissies gepresenteerd worden
zoals ze bij de bronhouder beschikbaar zijn. Door de resultaten op deze
manier beschikbaar te stellen, hopen we bij te dragen aan de
bewustwording en de discussie rond de mogelijkheden van het werken met
digitale methoden en technieken om toegang te bieden tot digitaal
erfgoed.

## Totstandkoming

De viewer van de Amsterdam Time Machine data index is ontwikkeld door Matúš Solčány van de Humanities Labs van de [UvA](https://aihr.uva.nl/humanities-labs/humanities-labs.html), in nauwe samenwerking met Ivan Kisjes (1976-2025) van de Amsterdam Time Machine en het [CREATE Lab](https://www.create.humanities.uva.nl/). Dankzij een additionele update door Berit Janssen van de Humanities Labs van de UvA zijn de verbinding met [Delpher](https://www.delpher.nl/) van de [Koninklijke Bibliotheek](https://www.kb.nl/) in Den Haag en met een deel van de [Beeldbank](https://archief.amsterdam/uitleg/beeldbank/13-zoeken-in-de-beeldbank) van het [Stadsarchief Amsterdam](https://www.amsterdam.nl/stadsarchief/) gerealiseerd. Leon van Wissen (CREATE Lab) heeft met de toevoeging van het Joods Monument van het [Joods Historisch Kwartier](https://jck.nl/) een begin gemaakt met de implementatie van de bronnen uit [Aan het juiste adres](https://aanhetjuisteadres.nl/). De overige bronnen uit deze applicatie zullen gaandeweg ook aan de Amsterdam Time Machine data index worden toegevoegd. Ingeborg Verheul, Boudewijn Koopmans en Julia Noordegraaf (UvA) verzorgden de projectleiding, de verantwoording en de impactdevelopment.  
