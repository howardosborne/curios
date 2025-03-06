var settings;

function getSettings(){
    href = encodeURI(window.location.href);
    url = `https://script.google.com/macros/s/AKfycbyEskUlQxAOp1rXvo40xbyZDQEgiojWiZXBexBGCLyr0ptkz2kT-3vjvXcCwzTH-zPSGg/exec?request=settings&href=${href}`
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      settings = JSON.parse(this.responseText);
    }};
    xmlhttp.open("GET", url, true);
    xmlhttp.send(); 
}

getSettings();

async function getArrivals(stopId){
  const url= `https://v6.db.transport.rest/stops/${stopId}/arrivals?duration=60`;
  const response = await fetch(url);
  const arrivals = await response.json();
  console.log(arrivals);
}

async function getDepartures(stopId){
  const url= `https://v6.db.transport.rest/stops/${stopId}/departures?duration=120`;
  const response = await fetch(url);
  const departuresJSON = await response.json();
  const departures = departuresJSON.departures;
  console.log(departures);
  for(var i=0;i<departures.length;i++){
        const departure = departures[i];
        trip_id = departure["tripId"];
        line_name = departure["line"]["name"];
        getLiveTrips(stopId,trip_id,line_name);
  };
}

async function getLiveTrips(from_stop_id,trip_id,line_name){
    let url=`https://v6.db.transport.rest/trips/${encodeURIComponent(trip_id)}?lineName=${encodeURI(line_name)}`;
    const response = await fetch(url);
    const tripjson = await response.json();
    const trip = tripjson.trip;
    trips[encodeURI(trip_id)] = trip;
    if("stopovers" in trip){
        let stopovers = trip["stopovers"];
        let remarks = "";
        if(trip["remarks"]){
            for(let i=0;i<trip["remarks"].length;i++){
                remarks += `<br>${trip["remarks"][i].text}`;
            }
        }
        let tripCard = '';
        let from_stop_id_noted = false;
        let from_stop_id_index;
        let latlngs = [];
        for(let i=0;i<stopovers.length;i++){
            if(stopovers[i].stop.id==from_stop_id){
                from_stop_id_noted = true;
                from_stop_id_index = i;
            }  
            let timestamp = "";
            if(i==0){stopovers[i].timestamp = stopovers[i].plannedDeparture;}
            else{
                if(stopovers[i].plannedArrival){stopovers[i].timestamp = stopovers[i].plannedArrival;}
                else{stopovers[i].timestamp = stopovers[i].plannedDeparture;}
            }
            if(from_stop_id_noted){
                tripCard += `<li class="list-group-item">${stopovers[i].timestamp.substring(11,19)}: <a href="#" onclick="showPlaceOnMap('${stopovers[i].stop.location.latitude}', '${stopovers[i].stop.location.longitude}','${stopovers[i].stop.name}')">${stopovers[i].stop.name}</a></li>`
                latlngs.push([stopovers[i].stop.location.latitude, stopovers[i].stop.location.longitude])
            }
        }
        if(from_stop_id_noted){
        let tripCardheader = `<div class="card">
            ${stopovers[from_stop_id_index].timestamp.substring(11,19)} 
            ${stopovers[from_stop_id_index].stop.name} to ${trip.destination.name}
            </div>`;
            //document.getElementById(`${from_stop_id}`).insertAdjacentHTML('beforeend',`${tripCardheader}`);
            var polyline = L.polyline(latlngs, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});      
            polyline.bindTooltip(`${trip.origin.name} to ${trip.destination.name}`);
            polyline.properties = trip;
            polyline.addTo(liveRouteLines);
        }
    }
}

async function _siteMarkerOnClick(e){
  let properties = e.sourceTarget.properties;
  document.getElementById("transportdetails").innerHTML = "";
  document.getElementById("details").innerHTML = `<h3>${properties.name}</h3><ul class="list-group list-group-flush"><li class="list-group-item">Quality: ${properties.quality2023}</li><li class="list-group-item">Monitoring: ${properties.management2023}</li><li class="list-group-item"><a href="${properties.bwProfileUrl}" target="_blank" title="plan" class="btn btn-outline-secondary btn-sm" role="button">view report</a><a href="/?action=destinations&lat=${e.latlng.lat}&lng=${e.latlng.lng}" target="_blank" title="directions" class="btn btn-outline-secondary btn-sm" role="button">get directions</a></li></ul>`;
}

async function _whsMarkerOnClick(e){
  let properties = e.sourceTarget.properties;
  document.getElementById("transportdetails").innerHTML = "";
  document.getElementById("details").innerHTML = `<h3>${properties.name_en}</h3><ul class="list-group list-group-flush"><li class="list-group-item">Category: ${properties.category}</li><li class="list-group-item">Description: ${properties.short_description_en}</li></ul>`;
  url = `https://v5.db.transport.rest/stops/nearby?latitude=${e.latlng.lat}&longitude=${e.latlng.lng}&results=3&distance=10000&stops=true`
  const response = await fetch(url);
  const stations = await response.json();
  console.log(stations);
  stops.clearLayers();
  let stopInfo = "";
  stations.forEach(station =>{
    let marker = L.marker([station.location.latitude, station.location.longitude],{icon:trainIcon});
    marker.bindTooltip(station.name);
    marker.bindPopup(`<ul class="list-group list-group-flush"><li class="list-group-item"><strong>${station.name}</strong></li></ul>`).openPopup();
    marker.properties = station;
    marker.addTo(stops);
    stopInfo += `<li class="list-group-item">
    <strong>${station.name}</strong> distance: ${station.distance} meters 
    </div><div id="${station.id}"></div>
    </li>`;
    map.flyTo([e.latlng.lat, e.latlng.lng])
    getDepartures(station.id);
  });
  if(stopInfo != ""){
  document.getElementById("transportdetails").innerHTML = `<h4>Nearest public transport</h4><ul class="list-group list-group-flush">${stopInfo}</ul>`
  }
}

async function _pianoMarkerOnClick(e){
  //Gare,Piano,Power&Station,Baby-Foot,Distr Histoires Courtes,Lat,Lon,Link
  let properties = e.sourceTarget.properties;
  document.getElementById("transportdetails").innerHTML = "";
  url = `https://v5.db.transport.rest/stops/nearby?latitude=${e.latlng.lat}&longitude=${e.latlng.lng}&results=3&distance=1000&stops=true`
  const response = await fetch(url);
  const stations = await response.json();
  console.log(stations);
  stops.clearLayers();
  let stopInfo = "";
  stations.forEach(station =>{
    let marker = L.marker([station.location.latitude, station.location.longitude],{icon:trainIcon});
    marker.bindTooltip(station.name);
    marker.bindPopup(`<ul class="list-group list-group-flush"><li class="list-group-item"><strong>${station.name}</strong></li></ul>`).openPopup();
    marker.properties = station;
    marker.addTo(stops);
    stopInfo += `<li class="list-group-item">
    <strong>${station.name}</strong> distance: ${station.distance} meters 
    </div><div id="${station.id}"></div>
    </li>`;
    map.flyTo([e.latlng.lat, e.latlng.lng])
    getDepartures(station.id);
  });
  if(stopInfo != ""){
  //document.getElementById("transportdetails").innerHTML = `<h4>Nearest public transport</h4><ul class="list-group list-group-flush">${stopInfo}</ul>`
  }
}

async function _placeMarkerOnClick(e){
  //Gare,Piano,Power&Station,Baby-Foot,Distr Histoires Courtes,Lat,Lon,Link
  let properties = e.sourceTarget.properties;
  document.getElementById("transportdetails").innerHTML = "";
  url = `https://v5.db.transport.rest/stops/nearby?latitude=${e.latlng.lat}&longitude=${e.latlng.lng}&results=3&distance=1000&stops=true`
  const response = await fetch(url);
  const stations = await response.json();
  console.log(stations);
  stops.clearLayers();
  let stopInfo = "";
  stations.forEach(station =>{
    let marker = L.marker([station.location.latitude, station.location.longitude],{icon:trainIcon});
    marker.bindTooltip(station.name);
    marker.bindPopup(`<ul class="list-group list-group-flush"><li class="list-group-item"><strong>${station.name}</strong></li></ul>`).openPopup();
    marker.properties = station;
    marker.addTo(stops);
    stopInfo += `<li class="list-group-item">
    <strong>${station.name}</strong> distance: ${station.distance} meters 
    </div><div id="${station.id}"></div>
    </li>`;
    map.flyTo([e.latlng.lat, e.latlng.lng])
    getDepartures(station.id);
  });
  if(stopInfo != ""){
  //document.getElementById("transportdetails").innerHTML = `<h4>Nearest public transport</h4><ul class="list-group list-group-flush">${stopInfo}</ul>`
  }
}