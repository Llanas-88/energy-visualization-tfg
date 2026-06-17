/*
-------------------------------------------------------
SIMULADOR GEOESPACIAL DE CONSUM ENERGÈTIC
TFG - Abel Llanas Muñoz

Aquest fitxer JavaScript gestiona:

1. La inicialització del mapa Leaflet.
2. La càrrega de dades des de GeoServer mitjançant WFS.
3. La conversió de coordenades amb Proj4js.
4. La representació dels edificis al mapa.
5. La simulació d'escenaris energètics i climàtics.
6. L'actualització del dashboard i dels gràfics.

Flux principal:
GeoServer → WFS → GeoJSON → Leaflet → Simulació → Dashboard
-------------------------------------------------------
*/

/* Inicialitza el mapa Leaflet centrat aproximadament al municipi del Catllar */
var map = L.map('map').setView([41.18, 1.32], 14);

/* Afegeix la capa base cartogràfica de CARTO/OpenStreetMap */
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO'
}).addTo(map);

/* Variables globals utilitzades al llarg de l'aplicació */
let geojson;
let electricitatChart;
let gasChart;
let aiguaChart;
let dadesOriginals;

/* Funció que retorna un color segons el consum energètic.

Els consums més baixos es representen en verd, els consums intermedis en groc/taronja i els consums més elevats en vermell. */
function getColor(value) {
    return value > 8 ? '#d7191c' :
           value > 5 ? '#fdae61' :
           value > 3 ? '#ffffbf' :
           value > 1.5 ? '#a6d96a' :
                         '#1a9641';
}

/* Carrega les dades dels edificis des de GeoServer.

La petició utilitza un servei WFS, que retorna les geometries i els atributs dels edificis en format GeoJSON.*/
fetch('http://127.0.0.1:8080/geoserver/tfg_catllar/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=tfg_catllar:CONSTRU_web&outputFormat=application/json')
.then(response => response.json())
.then(data => {
	
	/* Mostra les dades rebudes a la consola per facilitar la comprovació */
    console.log(data);
	
	/* Crea un nou FeatureCollection filtrant només els elements vàlids.

    Es conserven únicament les geometries que existeixen correctament i que tenen l'atribut es_edifici indicat com a verdader.*/
    dadesOriginals = {
        type: "FeatureCollection",
        features: data.features.filter(function(feature) {

			return feature.geometry &&
				   feature.geometry.type &&
				   feature.geometry.coordinates &&
				   feature.properties.es_edifici === true ||
					feature.properties.es_edifici === "true" ||
					feature.properties.es_edifici === 1;
		})
    };

/*Missatges de comprovació a la consola.

Serveixen per verificar el tipus de geometria i l'estructura de les coordenades rebudes des de GeoServer.*/
console.log(dadesOriginals.features[0].geometry.type);
console.log(
    JSON.stringify(
        dadesOriginals.features[0].geometry.coordinates[0]
    )
);

/* Defineix el sistema de coordenades EPSG:25831.

Aquest sistema correspon a ETRS89 / UTM zona 31N, habitual a Catalunya. Es fa servir perquè les dades originals poden venir en aquest sistema de coordenades.*/
proj4.defs("EPSG:25831", "+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs");

/* Crea la capa GeoJSON de Leaflet a partir de les dades filtrades.

coordsToLatLng transforma les coordenades originals EPSG:25831 a EPSG:4326, que és el sistema que utilitza Leaflet per representar les dades al mapa.*/
geojson = L.geoJSON(dadesOriginals, {
    coordsToLatLng: function(coords) {
        let p = proj4("EPSG:25831", "EPSG:4326", coords);
        return L.latLng(p[1], p[0]);
    },
	
/* Defineix l'estil inicial de cada edifici.

El color depèn del consum energètic total estimat i del factor de l'escenari seleccionat.*/
style: function(feature) {

    let factor = Number(document.getElementById("escenari")?.value || 1);

    let consum = (Number(feature.properties.consum_total || 0) * factor) / 1000;

    return {
        fillColor: getColor(consum),
        weight: 1,
        opacity: 1,
        color: '#333',
        fillOpacity: 0.75
    };
},
	 /*	Assigna a cada edifici els esdeveniments interactius, com el ressaltat en passar el ratolí.*/
        onEachFeature: onEachFeature
    }).addTo(map);

	/* Inicialitza els gràfics del dashboard */
    crearGrafic();

	/* Calcula i mostra l'escenari inicial */
    actualitzarEscenari(1);

    /* Quan l'usuari canvia l'escenari de rehabilitació, es recalculen els consums i s'actualitza el mapa.*/
    document.getElementById("escenari").addEventListener("change", function() {
		actualitzarEscenari();
	});

    /* Quan l'usuari canvia l'escenari climàtic, també es recalculen tots els valors.*/
	document.getElementById("clima").addEventListener("change", function() {
		actualitzarEscenari();
	});

});

/* Defineix la interacció individual de cada edifici del mapa.

En passar el ratolí per sobre d'un edifici, aquest es ressalta. Quan el ratolí surt, es recupera l'estil segons el consum calculat.*/
function onEachFeature(feature, layer) {
    layer.on({
        /* Ressalta visualment l'edifici seleccionat*/
		mouseover: function(e) {
            e.target.setStyle({
                weight: 3,
                color: '#000',
                fillOpacity: 0.9
            });
        },
		/* Recupera l'estil original quan el ratolí surt de l'edifici*/
        mouseout: function(e) {
			let factor = Number(document.getElementById("escenari")?.value || 1);
			let props = e.target.feature.properties;

			let electricitat = (Number(props.consum_electricitat || 0) * factor) / 1000;
			let gas = (Number(props.consum_gas || 0) * factor) / 1000;
			let consumTotal = electricitat + gas;

    e.target.setStyle({
        fillColor: getColor(consumTotal),
        weight: 1,
        opacity: 1,
        color: '#333',
        fillOpacity: 0.75
    });
}
    });
}

/* Inicialitza els tres gràfics del dashboard amb Chart.js.

	Es creen gràfics de barres independents per a:
		- Electricitat
		- Gas
		- Aigua

Inicialment tenen valor 0 i posteriorment s'actualitzen amb els valors calculats per la simulació.*/
function crearGrafic() {

	/* Gràfic del consum elèctric*/
    electricitatChart = new Chart(document.getElementById("electricitatChart"), {
        type: "bar",
        data: {
            labels: ["Electricitat"],
            datasets: [{
                label: "Electricitat (MWh)",
                data: [0],
                backgroundColor: ["#66bb6a"]
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
	
	/* Gràfic del consum de gas*/
    gasChart = new Chart(document.getElementById("gasChart"), {
        type: "bar",
        data: {
            labels: ["Gas"],
            datasets: [{
                label: "Gas (MWh)",
                data: [0],
                backgroundColor: ["#bdbdbd"]
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

	/* Gràfic del consum d'aigua*/
    aiguaChart = new Chart(document.getElementById("aiguaChart"), {
        type: "bar",
        data: {
            labels: ["Aigua"],
            datasets: [{
                label: "Aigua (m³)",
                data: [0],
                backgroundColor: ["#64b5f6"]
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

/* Funció principal de simulació.

	Aquesta funció:
	1. Llegeix l'escenari energètic seleccionat.
	2. Llegeix l'escenari climàtic seleccionat.
	3. Aplica els factors correctors corresponents.
	4. Recalcula els consums de cada edifici.
	5. Actualitza la simbologia del mapa.
	6. Actualitza els indicadors del dashboard.
	7. Actualitza els gràfics.*/
function actualitzarEscenari() {
	
	/* Factor de rehabilitació energètica seleccionat */
    let factor = Number(document.getElementById("escenari")?.value || 1);
	/* Escenari climàtic seleccionat */
    let clima = document.getElementById("clima")?.value || "normal";

    /* Factors climàtics inicials.

    L'any normal no modifica els consums.*/
    let factorElectricitatClima = 1;
    let factorGasClima = 1;
    let factorAiguaClima = 1;

    /* Any fred:
		- Augmenta lleugerament l'electricitat.
		- Augmenta especialment el gas per calefacció.
		- Manté estable el consum d'aigua.*/
    if (clima === "fred") {
        factorElectricitatClima = 1.05;
        factorGasClima = 1.20;
        factorAiguaClima = 1.00;
    }
	
	/* Any calorós:
		- Augmenta l'electricitat per refrigeració.
		- Redueix el consum de gas.
		- Incrementa lleugerament el consum d'aigua.*/
    if (clima === "caloros") {
        factorElectricitatClima = 1.15;
        factorGasClima = 0.90;
        factorAiguaClima = 1.05;
    }

	/* Variables acumuladores per calcular totals municipals*/
    let totalConsum = 0;
    let totalElectricitat = 0;
    let totalGas = 0;
    let totalAigua = 0;
    
	/* Nombre total d'edificis vàlids*/
	let numEdificis = dadesOriginals.features.length;
	/* Consum base utilitzat per calcular la variació percentual*/
	let consumBase = 0;


    /* Recorre tots els edificis representats al mapa.

    Per cada edifici es recalculen els consums segons l'escenari energètic i climàtic seleccionat.*/	
    geojson.eachLayer(function(layer) {

        let props = layer.feature.properties;

			/* Consum base d'electricitat en MWh*/
			let electricitatBase =
				Number(props.consum_electricitat || 0) / 1000;

			/* Consum base de gas en MWh*/
			let gasBase =
				Number(props.consum_gas || 0) / 1000;

			/* Acumulació del consum base energètic*/
			consumBase += electricitatBase + gasBase;
			
			/*Consum elèctric ajustat per:
				- factor de rehabilitació
				- factor climàtic
			Conversió de kWh a MWh dividint entre 1000.*/
			let electricitat =
				(Number(props.consum_electricitat || 0)
				* factor
				* factorElectricitatClima) / 1000;

        /* Consum de gas ajustat per rehabilitació i clima. També es converteix de kWh a MWh.*/
			let gas =
				(Number(props.consum_gas || 0)
				* factor
				* factorGasClima) / 1000;

			/* Consum d'aigua ajustat pels escenaris. En aquest cas es manté en m³ i no es divideix entre 1000.*/
			let aigua =
				Number(props.consum_aigua || 0)
				* factor
				* factorAiguaClima;

			/* Consum energètic total de l'edifici */
			let consumTotal = electricitat + gas;

        totalConsum += consumTotal;
        totalElectricitat += electricitat;
        totalGas += gas;
        totalAigua += aigua;

        layer.setStyle({
    fillColor: getColor(consumTotal),
    weight: 1,
    fillOpacity: 0.75
});

        /* Crea o actualitza la finestra emergent de cada edifici.

        El popup mostra:
			- Ús de l'edifici
			- Consum energètic total
			- Consum elèctric
			- Consum de gas
			- Consum d'aigua*/
        layer.bindPopup(
            "<b>Ús edifici:</b> " + (props.us_edifici || "Sense dades") + "<br>" +
			"<b>Consum energètic:</b> " + consumTotal.toLocaleString("ca-ES", {maximumFractionDigits: 0}) + " MWh/any<br>" +
			"<b>Electricitat:</b> " + electricitat.toLocaleString("ca-ES", {maximumFractionDigits: 0}) + " MWh/any<br>" +
			"<b>Gas:</b> " + gas.toLocaleString("ca-ES", {maximumFractionDigits: 0}) + " MWh/any<br>" +
			"<b>Aigua:</b> " + aigua.toLocaleString("ca-ES", {maximumFractionDigits: 0}) + " m³/any"
        );
    });


    /* Calcula la variació percentual respecte del consum base.

    Un valor negatiu indica reducció de consum.
    Un valor positiu indica increment de consum.*/
    let variacio = ((totalConsum - consumBase) / consumBase) * 100;
	/* Actualitza els indicadors textuals del dashboard*/
	document.getElementById("numEdificis").textContent = numEdificis;
	document.getElementById("estalviPercent").textContent =
    (variacio > 0 ? "+" : "") + variacio.toFixed(0) + "%";
	document.getElementById("totalConsum").textContent = totalConsum.toLocaleString("ca-ES", {maximumFractionDigits: 0});
    document.getElementById("totalElectricitat").textContent = totalElectricitat.toLocaleString("ca-ES", {maximumFractionDigits: 0});
    document.getElementById("totalGas").textContent = totalGas.toLocaleString("ca-ES", {maximumFractionDigits: 0});
    document.getElementById("totalAigua").textContent = totalAigua.toLocaleString("ca-ES", {maximumFractionDigits: 0});

	/* Actualitza el gràfic d'electricitat*/
	electricitatChart.data.datasets[0].data = [
    totalElectricitat
	];

	electricitatChart.update();

	/* Actualitza el gràfic de gas*/
	gasChart.data.datasets[0].data = [
		totalGas
	];

	gasChart.update();

	/* Actualitza el gràfic d'aigua */
	aiguaChart.data.datasets[0].data = [
		totalAigua
	];

	aiguaChart.update();
}

/* Control del botó per plegar o desplegar el dashboard.

Quan el panell està plegat, només es mostra la capçalera. Això permet veure millor el mapa.*/
document.getElementById("toggleDashboard").addEventListener("click", function() {
    let dashboard = document.getElementById("dashboard");

    dashboard.classList.toggle("collapsed");

    if (dashboard.classList.contains("collapsed")) {
        this.textContent = "+";
    } else {
        this.textContent = "−";
    }
});

