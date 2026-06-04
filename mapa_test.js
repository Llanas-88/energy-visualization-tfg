var map = L.map('map').setView([41.18, 1.32], 14);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO'
}).addTo(map);

let geojson;
let electricitatChart;
let gasChart;
let aiguaChart;
let dadesOriginals;

// Funció de colors segons el consum
function getColor(value) {
    return value > 8 ? '#d7191c' :
           value > 5 ? '#fdae61' :
           value > 3 ? '#ffffbf' :
           value > 1.5 ? '#a6d96a' :
                         '#1a9641';
}

// Carregar GeoJSON
fetch('http://127.0.0.1:8080/geoserver/tfg_catllar/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=tfg_catllar:CONSTRU_web&outputFormat=application/json')
.then(response => response.json())
.then(data => {

    console.log(data);

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

console.log(dadesOriginals.features[0].geometry.type);
console.log(
    JSON.stringify(
        dadesOriginals.features[0].geometry.coordinates[0]
    )
);

proj4.defs("EPSG:25831", "+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs");

geojson = L.geoJSON(dadesOriginals, {
    coordsToLatLng: function(coords) {
        let p = proj4("EPSG:25831", "EPSG:4326", coords);
        return L.latLng(p[1], p[0]);
    },
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
        onEachFeature: onEachFeature
    }).addTo(map);

    crearGrafic();

    actualitzarEscenari(1);

    document.getElementById("escenari").addEventListener("change", function() {
		actualitzarEscenari();
	});

	document.getElementById("clima").addEventListener("change", function() {
		actualitzarEscenari();
	});

});

function onEachFeature(feature, layer) {
    layer.on({
        mouseover: function(e) {
            e.target.setStyle({
                weight: 3,
                color: '#000',
                fillOpacity: 0.9
            });
        },
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

function crearGrafic() {

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

function actualitzarEscenari() {

    let factor = Number(document.getElementById("escenari")?.value || 1);
    let clima = document.getElementById("clima")?.value || "normal";

    let factorElectricitatClima = 1;
    let factorGasClima = 1;
    let factorAiguaClima = 1;

    if (clima === "fred") {
        factorElectricitatClima = 1.05;
        factorGasClima = 1.20;
        factorAiguaClima = 1.00;
    }

    if (clima === "caloros") {
        factorElectricitatClima = 1.15;
        factorGasClima = 0.90;
        factorAiguaClima = 1.05;
    }

    let totalConsum = 0;
    let totalElectricitat = 0;
    let totalGas = 0;
    let totalAigua = 0;
    let numEdificis = dadesOriginals.features.length;
	let consumBase = 0;
	
    geojson.eachLayer(function(layer) {

        let props = layer.feature.properties;

			let electricitatBase =
				Number(props.consum_electricitat || 0) / 1000;

			let gasBase =
				Number(props.consum_gas || 0) / 1000;

			consumBase += electricitatBase + gasBase;
			
			let electricitat =
				(Number(props.consum_electricitat || 0)
				* factor
				* factorElectricitatClima) / 1000;

			let gas =
				(Number(props.consum_gas || 0)
				* factor
				* factorGasClima) / 1000;

			let aigua =
				Number(props.consum_aigua || 0)
				* factor
				* factorAiguaClima;

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

        layer.bindPopup(
            "<b>Ús edifici:</b> " + (props.us_edifici || "Sense dades") + "<br>" +
			"<b>Consum energètic:</b> " + consumTotal.toLocaleString("ca-ES", {maximumFractionDigits: 0}) + " MWh/any<br>" +
			"<b>Electricitat:</b> " + electricitat.toLocaleString("ca-ES", {maximumFractionDigits: 0}) + " MWh/any<br>" +
			"<b>Gas:</b> " + gas.toLocaleString("ca-ES", {maximumFractionDigits: 0}) + " MWh/any<br>" +
			"<b>Aigua:</b> " + aigua.toLocaleString("ca-ES", {maximumFractionDigits: 0}) + " m³/any"
        );
    });

    let variacio = ((totalConsum - consumBase) / consumBase) * 100;
	document.getElementById("numEdificis").textContent = numEdificis;
	document.getElementById("estalviPercent").textContent =
    (variacio > 0 ? "+" : "") + variacio.toFixed(0) + "%";
	document.getElementById("totalConsum").textContent = totalConsum.toLocaleString("ca-ES", {maximumFractionDigits: 0});
    document.getElementById("totalElectricitat").textContent = totalElectricitat.toLocaleString("ca-ES", {maximumFractionDigits: 0});
    document.getElementById("totalGas").textContent = totalGas.toLocaleString("ca-ES", {maximumFractionDigits: 0});
    document.getElementById("totalAigua").textContent = totalAigua.toLocaleString("ca-ES", {maximumFractionDigits: 0});

	electricitatChart.data.datasets[0].data = [
    totalElectricitat
	];

	electricitatChart.update();

	gasChart.data.datasets[0].data = [
		totalGas
	];

	gasChart.update();

	aiguaChart.data.datasets[0].data = [
		totalAigua
	];

	aiguaChart.update();
}

document.getElementById("toggleDashboard").addEventListener("click", function() {
    let dashboard = document.getElementById("dashboard");

    dashboard.classList.toggle("collapsed");

    if (dashboard.classList.contains("collapsed")) {
        this.textContent = "+";
    } else {
        this.textContent = "−";
    }
});
