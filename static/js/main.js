var map;
var sidePanel;
var popup;
var settings;
var dbServer = "v6.db.transport.rest";

var startSelect;
var destinationSelect;

//lookups for info about all places, hops and inspired trips
var all_places = {};
var all_hops = {};
var inspiredTrips;
var agencyLookup;
var journeyLookup;
var trips = {};
var stopsPlacesLookup = {};
var stopsForPlaces = {};

//saving settings when moving between tabs
var lastScrollTop = {};
var lastTab = "tab-home";

//freestyle layers
var freestyleStartPoints;
var possibleHops;
var candidateHop;
var hops;
var routeLines;

//inspire layers
var possibleInspiredTrip;
var possibleInspiredTripRouteLines;

//fromTo layers
var possibleFromToStartPoints;
var possibleFromToEndPoints;
var fromToStartPoint;
var fromToDestination;
var fromToLines;
var fromToStops = {};
var fromToStopsMap = {};
//live departures layers
var liveRouteLines;
var liveStops;

var lookup = {}
var openRequestCount = 0

var modes = {"train":"checked","bus":"checked","ferry":"checked"}

function startUp(){
  //make a map
  map = L.map('map').setView([45, 10], 5);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19,attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);

  L.control.scale({position: 'topleft'}).addTo(map);
  L.control.zoom({position: 'bottomright'}).addTo(map);

  sidePanel = L.control.sidepanel('mySidepanelLeft', {
    tabsPosition: 'top',
    startTab: 'tab-home'
  }).addTo(map);

  //add the freestyle layers to be used
  freestyleStartPoints = L.markerClusterGroup({maxClusterRadius:20});
  possibleHops = L.markerClusterGroup({maxClusterRadius:20});
  hops = new L.LayerGroup();
  routeLines = new L.LayerGroup();
  possibleFromToStartPoints = L.markerClusterGroup({maxClusterRadius:20});
  possibleFromToEndPoints = L.markerClusterGroup({maxClusterRadius:20});
  fromToStartPoint = new L.LayerGroup();
  fromToDestination = new L.LayerGroup();
  fromToLines = new L.LayerGroup();
  fromToStops = new L.LayerGroup();
  possibleInspiredTrip = new L.FeatureGroup();
  possibleInspiredTripRouteLines = new L.LayerGroup();
  liveStops = new L.LayerGroup();
  liveStop = new L.LayerGroup();
  liveRouteLines = new L.LayerGroup();

  L.easyButton('<img src="/static/icons/resize.png" alt="resize" title="resize">', function(btn, map){
    map.fitBounds(possibleHops.getBounds())
  }).addTo(map);

  getSettings();
  getAllPlaces();
  getAgencyLookup();
  getInspiredTrips();
  showHomeTab();
  //prepare destination tab
  document.getElementById("departureTime").value = new Date().toISOString().slice(0,16);
  document.getElementById("startSelect").addEventListener("focusout", setStartValue);
  document.getElementById("destinationSelect").addEventListener("focusout", setDestinationValue);
}

async function getSettings(){
  href = encodeURIComponent(window.location.href);
  url = `https://script.google.com/macros/s/AKfycbyEskUlQxAOp1rXvo40xbyZDQEgiojWiZXBexBGCLyr0ptkz2kT-3vjvXcCwzTH-zPSGg/exec?request=settings&href=${href}`
  const response = await fetch(url);
  if(response.status == 200){
    const settings = await response.json();
    dbServer = settings.dbServer;
  }
}

function getAllPlaces(){
  var url = "/static/places.json";
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
  if (this.readyState == 4 && this.status == 200) {
    all_places = JSON.parse(this.responseText);
    getAllHopsandShowPlaceMarkers();
  }};
  
  xmlhttp.open("GET", url,true);
  xmlhttp.send(); 
}

function getAllHopsandShowPlaceMarkers(){
  var xmlhttp = new XMLHttpRequest();
  var url = `/static/hops.json`;
  xmlhttp.onreadystatechange = function() {
  if (this.readyState == 4 && this.status == 200) {
    var response = JSON.parse(this.responseText);
    all_hops = response;
    addFreestyleStartPoints();
    addLookup('places_with_ao',`/static/places_with_ao.json`);
    addLookup('places_with_swims',`/static/places_with_swims.json`);
    addLookup('places_with_world_heritage_sites',`/static/places_with_world_heritage_sites.json`);
    addLookup('places_with_videos',`/static/places_with_videos.json`);
    addLookup('places_with_strolls',`/static/places_with_strolls.json`);
    addLookup('places_with_greeters',`/static/places_with_greeters.json`);
    addLookup('links',`/static/links.json`);
    checkHref();
  }};
  xmlhttp.open("GET", url, true);
  xmlhttp.send(); 
}

function addLookup(resourceName,url){
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
  if (this.readyState == 4 && this.status == 200) {
    var response = JSON.parse(this.responseText);
    lookup[resourceName] = response;
  }};
  xmlhttp.open("GET", url, true);
  xmlhttp.send(); 
}

function addFreestyleStartPoints(){
    Object.entries(all_places).forEach((entry) => {
      const [id, place] = entry;
      if(id in all_hops){
        let my_icon = L.icon({iconUrl: `/static/icons/home.png`,iconSize: [24, 24], iconAnchor: [12,24]});
        let marker = L.marker([place.place_lat, place.place_lon],{icon:my_icon});
        marker.bindTooltip(decodeURI(place.place_name));
        marker.properties = place;
        marker.addEventListener('click', _starterMarkerOnClick);
        marker.addTo(freestyleStartPoints);
      }
    });
}

async function checkHref(){
  //see if the request was looking to do a lookup
  const myReFromTo = RegExp('.+fromto&from=(\\w+)&to=(\\w+)', 'g');
  const myRePlace = RegExp('.+place&place_id=(\\w+)', 'g');
  const myReInspire = RegExp('.+inspire&id=(\\w+)', 'g');
  const myReDepart = RegExp('.+departures&from=([^&]+)', 'g');
  const myReDepartLatLng = RegExp('.+departures&lat=([^&]+)&lng=([^&]+)', 'g');
  const myReDest = RegExp('.+[^&]from=([^&]+)&to=([^&]+)', 'g');
  const myReDestLatLng = RegExp('.+destinations&lat=([^&]+)&lng=([^&]+)', 'g');
  const myReShare = RegExp('.+share&hops=(.+)', 'g');
  var myArray;

  if(myArray = myReFromTo.exec(window.location.href)){
    //get stops from lookup
    if(!lookup["stops_for_places"]){
      const response = await fetch('/static/stops_for_places.json');
      let block = "";
      if(response.status == 200){
        const jsonResponse = await response.json();
        lookup["stops_for_places"] = jsonResponse;
        fromToStopsMap[lookup["stops_for_places"][myArray[1]][0]["name"]] = {'lat':lookup["stops_for_places"][myArray[1]][0]["location"]["latitude"],'lng':lookup["stops_for_places"][myArray[1]][0]["location"]["longitude"],'stationId':lookup["stops_for_places"][myArray[1]][0]["id"]};
        fromToStopsMap[lookup["stops_for_places"][myArray[2]][0]["name"]] = {'lat':lookup["stops_for_places"][myArray[2]][0]["location"]["latitude"],'lng':lookup["stops_for_places"][myArray[2]][0]["location"]["longitude"],'stationId':lookup["stops_for_places"][myArray[2]][0]["id"]};
        showDestinationTab();
        document.getElementById("startSelect").value = lookup["stops_for_places"][myArray[1]][0]["name"];
        document.getElementById("destinationSelect").value = lookup["stops_for_places"][myArray[2]][0]["name"];
        findFabRoutes();    
      }
    }
    else{
      fromToStopsMap[lookup["stops_for_places"][myArray[1]][0]["name"]] = {'lat':lookup["stops_for_places"][myArray[1]][0]["location"]["latitude"],'lng':lookup["stops_for_places"][myArray[1]][0]["location"]["longitude"],'stationId':lookup["stops_for_places"][myArray[1]][0]["id"]};
      fromToStopsMap[lookup["stops_for_places"][myArray[2]][0]["name"]] = {'lat':lookup["stops_for_places"][myArray[2]][0]["location"]["latitude"],'lng':lookup["stops_for_places"][myArray[2]][0]["location"]["longitude"],'stationId':lookup["stops_for_places"][myArray[2]][0]["id"]};
      showDestinationTab();
      document.getElementById("startSelect").value = lookup["stops_for_places"][myArray[1]][0]["name"];
      document.getElementById("destinationSelect").value = lookup["stops_for_places"][myArray[2]][0]["name"];
      findFabRoutes(); 
    }
  }
  else if(myArray = myRePlace.exec(window.location.href)){
    let place_id = myArray[1];
    place_id = place_id.replace("germany", "Germany");
    let place = all_places[place_id];
    setPlaceDetails(place_id);
    popup_text = `
      <div class="card mb-3">
       <img src="${place.place_image}" class="img-fluid rounded-start" style="max-height:250px" alt="${place.place_name}" title = "${place.image_attribution}">
       <div class="card-img-overlay">
       <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div></div>
       </div>
       <ul class="list-group list-group-flush">
        <li class="list-group-item">${decodeURIComponent(place.place_brief_desc)} <a href="#" onclick="openPlaceDetails('${place.place_id}')"> more...</a></li>
       </ul>
      </div>`
    popup = L.popup().setLatLng([place.place_lat,place.place_lon]).setContent(popup_text).openOn(map);
    map.flyTo([place.place_lat, place.place_lon]);
    hideSidepanal();
  }
  else if(myArray = myReInspire.exec(window.location.href)){
    showInspireTab();
    showInspiredRoute(myArray[1]);
  }
  else if(myArray = myReDest.exec(window.location.href)){
    let response = await fetch(`https://${dbServer}/locations?query=${encodeURIComponent(myArray[1])}&poi=false&addresses=false`);
    if(response.status == 200){
      let jsonResponse = await response.json();
      let options = '';
      for(var i=0;i<jsonResponse.length;i++){
        if(jsonResponse[i]["id"]){
          fromToStopsMap[jsonResponse[i]["name"]] = {'lat':jsonResponse[i]["location"]["latitude"],'lng':jsonResponse[i]["location"]["longitude"],'stationId':jsonResponse[i]["id"]};
          options += `<option>${jsonResponse[i]["name"]}</option>`;  
        }
      };
      document.getElementById("startList").innerHTML = options;
      document.getElementById("startSelect").value = jsonResponse[0]["name"];  
    }
    else if(response.status>399){console.log(`checkHref status:${response.status} ${window.location.href}`);} 
    response = await fetch(`https://${dbServer}/locations?query=${encodeURIComponent(myArray[2])}&poi=false&addresses=false`);
    if(response.status == 200){
      let jsonResponse = await response.json();
      let options = '';
      for(var i=0;i<jsonResponse.length;i++){
        if(jsonResponse[i]["id"]){
          fromToStopsMap[jsonResponse[i]["name"]] = {'lat':jsonResponse[i]["location"]["latitude"],'lng':jsonResponse[i]["location"]["longitude"],'stationId':jsonResponse[i]["id"]};
          options += `<option>${jsonResponse[i]["name"]}</option>`;  
        }
      };
      document.getElementById("destinationList").innerHTML = options;
      document.getElementById("destinationSelect").value = jsonResponse[0]["name"];
    }
    else if(response.status>399){console.log(`checkHref status:${response.status} ${window.location.href}`);} 
    enableFindFabRoutes();
    findFabRoutes();
    showDestinationTab();
  }  
  else if(myArray = myReDestLatLng.exec(window.location.href)){
    let options = "";
    let url = `https://${dbServer}/locations/nearby?latitude=${myArray[1]}&longitude=${myArray[2]}&results=1&distance=20000&stops=true`;
    let response = await fetch(url);
    let jsonResponse = await response.json();
    for(var i=0;i<jsonResponse.length;i++){
      if(jsonResponse[i]["id"]){
        fromToStopsMap[jsonResponse[i]["name"]] = {'lat':jsonResponse[i]["location"]["latitude"],'lng':jsonResponse[i]["location"]["longitude"],'stationId':jsonResponse[i]["id"]};
        options += `<option>${jsonResponse[i]["name"]}</option>`;  
      }
    };
    document.getElementById("destinationList").innerHTML = options;
    document.getElementById("destinationSelect").value = jsonResponse[0]["name"];
    getLiveDepartures()
    showDestinationTab();
  }  
  else if(myArray = myReDepart.exec(window.location.href)){
    const response = await fetch(`https://${dbServer}/locations?query=${encodeURIComponent(myArray[1])}&poi=false&addresses=false`);
    let block = "";
    if(response.status == 200){
      const jsonResponse = await response.json();
      let options = '';
      for(var i=0;i<jsonResponse.length;i++){
        if(jsonResponse[i]["id"]){
          fromToStopsMap[jsonResponse[i]["name"]] = {'lat':jsonResponse[i]["location"]["latitude"],'lng':jsonResponse[i]["location"]["longitude"],'stationId':jsonResponse[i]["id"]};
          options += `<option>${jsonResponse[i]["name"]}</option>`;  
        }
      };
      document.getElementById("liveList").innerHTML = options;
      document.getElementById("liveSelect").value = jsonResponse[0]["name"];
    }
    else if(response.status>399){console.log(`checkHref status:${response.status} ${window.location.href}`);} 
    getLiveDepartures()
    showLiveTab();
  }  
  else if(myArray = myReDepartLatLng.exec(window.location.href)){
    let options = "";
    let url = `https://${dbServer}/locations/nearby?latitude=${myArray[1]}&longitude=${myArray[2]}&results=1&distance=20000&stops=true`;
    let response = await fetch(url);
    let jsonResponse = await response.json();
    for(var i=0;i<jsonResponse.length;i++){
      if(jsonResponse[i]["id"]){
        fromToStopsMap[jsonResponse[i]["name"]] = {'lat':jsonResponse[i]["location"]["latitude"],'lng':jsonResponse[i]["location"]["longitude"],'stationId':jsonResponse[i]["id"]};
        options += `<option>${jsonResponse[i]["name"]}</option>`;  
      }
    };
    document.getElementById("liveList").innerHTML = options;
    document.getElementById("liveSelect").value = jsonResponse[0]["name"];
    getLiveDepartures()
    showLiveTab();
  }  
  else if(myArray = myReShare.exec(window.location.href)){
    addSharedHops(myArray[1]);
  }
}

function setPlaceDetails(place_id){
  document.getElementById("placeDetailsTitle").innerHTML = all_places[place_id]["place_name"];
  document.getElementById("placeDetailsImage").src = all_places[place_id]["place_image"];
  document.getElementById("placeDetailsImage").alt = all_places[place_id]["place_name"];
  document.getElementById("placeDetailsImage").title = all_places[place_id]["image_attribution"];
  document.getElementById("placeDetailsDescription").innerHTML = all_places[place_id]["place_longer_desc"];

  if(lookup["links"] && lookup["links"][place_id]){
    let output = `<h5>Useful links</h5><ul class="list-group list-group-flush">`;
    Object.entries(lookup["links"][place_id]).forEach((entry) => {
      const [id, link] = entry;
      output += `<li class="list-group-item"><a href="${link.link}" class="link-dark link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover" target="_blank">${decodeURIComponent(link.text)}</a></li>`;
    });
    output +="</ul>";
    document.getElementById("links").innerHTML = `<div class="card-body">${output}</div>`;
  }
  else{
    document.getElementById("links").innerHTML = "";
  }
  if(lookup["places_with_strolls"] && lookup["places_with_strolls"][place_id]){
    let output = `<h5>Station strolls</h5>`;
    Object.entries(lookup["places_with_strolls"][place_id]).forEach((entry) => {
      const [id, stroll] = entry;
      output += `
    <div class="card mb-3">
     <img src="${stroll.image}" class="img-fluid rounded-start" style="max-height:250px" alt="place image" title = "${place.image_attribution}">
     <div class="card-img-overlay">
       <div class="row justify-content-evenly"><div class="col"><a href="${stroll.link}" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000;" target="_blank">${stroll.title}</a></div></div>
     </div>
     <p class="card-text">${decodeURIComponent(stroll.text)}</p>
    </div>`
    });
    document.getElementById("strolls").innerHTML = `<div class="card-body">${output}</div>`;
  }
  else{
    document.getElementById("strolls").innerHTML = "";
  }
  if(lookup["places_with_videos"] && lookup["places_with_videos"][place_id]){
    let output = `<h5>Videos</h5>`;
    Object.entries(lookup["places_with_videos"][place_id]).forEach((entry) => {
      const [id, video] = entry;
      output += `<div class="card mb-3">
      <a href="${video.link}" target="_blank"><img src="${video.image}" class="img-fluid rounded-start" style="max-height:250px" alt="place image"></a>
      <p class="card-text">${decodeURIComponent(video.text)}</p>
      </div>`;
    });

    document.getElementById("videos").innerHTML = `<div class="card-body">${output}</div>`;
  }
  else{
    document.getElementById("videos").innerHTML = "";
  }
  if(lookup["places_with_ao"] && lookup["places_with_ao"][place_id]){
    let output = `<h5>Atlas Obsura</h5><ul class="list-group list-group-flush">`;
    Object.entries(lookup["places_with_ao"][place_id]).forEach((entry) => {
      const [id, place] = entry;
      output += `<li class="list-group-item"><a href="${place.url}" class="link-dark link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover" target="_blank">${decodeURIComponent(place.title)}</a></li>`;
    });    
    output += `</ul>`;
    document.getElementById("aoSites").innerHTML = `<div class="card-body">${output}</div>`;
  }
  else{
    document.getElementById("aoSites").innerHTML = "";
  }
  if(lookup["places_with_world_heritage_sites"] && lookup["places_with_world_heritage_sites"][place_id]){
    let output = `<h5>World Heritage</h5><ul class="list-group list-group-flush">`;
    Object.entries(lookup["places_with_world_heritage_sites"][place_id]).forEach((entry) => {
      const [id, place] = entry;
      output += `<li class="list-group-item"><a href="#" class="link-dark link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover" onclick="showWorldHeritageSite('${id}','${place_id}')">${decodeURIComponent(place.name_en)}</a></li>`;
    });
    output += `</ul>`;
    document.getElementById("worldHeritageSites").innerHTML = `<div class="card-body">${output}</div>`;
  }
  else{
    document.getElementById("worldHeritageSites").innerHTML = "";
  }
  if(lookup["places_with_swims"] && lookup["places_with_swims"][place_id]){
    let output = `<h5>Wild swimming spots</h5><ul class="list-group list-group-flush">`;
    Object.entries(lookup["places_with_swims"][place_id]).forEach((entry) => {
      const [id, place] = entry;
      output += `<li class="list-group-item"><a href="#" class="link-dark link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover" onclick="showSwimSpot('${id}','${place_id}')">${decodeURIComponent(place.nameText)}</a></li>`;
    });
    output += `</ul>`;
    document.getElementById("bathingSites").innerHTML = `<div class="card-body">${output}</div>`;
  }
  else{
    document.getElementById("bathingSites").innerHTML = "";
  }
  if(lookup["places_with_greeters"] && lookup["places_with_greeters"][place_id]){
    let output = `<h5>Greeters</h5>`;
    Object.entries(lookup["places_with_greeters"][place_id]).forEach((entry) => {
      const [id, greeter] = entry;
      output += `
    <div class="card mb-3">
     <img src="${greeter.image_url}" class="img-fluid rounded-start" style="max-height:250px" alt="place image" title = "${greeter.place_name}">
     <div class="card-img-overlay">
       <div class="row justify-content-evenly"><div class="col"><a href="${greeter.greeter_page}" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000;" target="_blank">${greeter.place_name}</a></div></div>
     </div>
     <p class="card-text">Why not meet a local greeter who will show you around their home town for free?</p>
    </div>`
    });
    document.getElementById("greeters").innerHTML = `<div class="card-body">${output}</div>`;
  }
  else{
    document.getElementById("greeters").innerHTML = "";
  }
}

function showWorldHeritageSite(id,place_id){
  //needs work
  let place = lookup["places_with_world_heritage_sites"][place_id][id]
  let popup_text = `<div class="card mb-3">
  <h5 class="card-header">${place.name_en}</h5>
  <div class="card-body">
   ${decodeURIComponent(place.short_description_en)}
  <a href="https://whc.unesco.org/en/list/" target="_blank" link-dark link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover>more about world heritage sites</a>
  </div>
 </div>
`
popup = L.popup().setLatLng([place.latitude,place.longitude]).setContent(popup_text).openOn(map);
}

function showSwimSpot(id,place_id){
  //needs work
  let place = lookup["places_with_swims"][place_id][id]
  let popup_text = `
  <div class="card mb-3">
    <h5 class="card-header">${place.nameText}<img src="/static/icons/hopping_icon.png"></h5>
    <div class="row"><div class="col"><span class="card-text">Waterbody: ${place.specialisedZoneType}</span></div></div>
    <div class="row"><div class="col"><span class="card-text">Latest assessment: ${place.quality2023}</span></div></div>
 	<div class="row"><div class="col"><span class="card-text">Nearest stop: ${place.stops[0].stop_name} ${place.stops[0].distance} meters</span></div></div>   
	<div class="row"><div class="col"><a class="card-text" href='${place.bwProfileUrl}' target="_blank">Report details</a></div></div>

  </div>`
//openPlaceDetails();
popup = L.popup().setLatLng([place.latitude,place.longitude]).setContent(popup_text).openOn(map);
}

async function getStopsNearLocation(lat,lng,no=1,distance=10000){
  let url = `https://${dbServer}/locations/nearby?latitude=${lat}&longitude=${lng}&results=${no}&distance=${distance}&stops=true`;
  let response = await fetch(url);
  let jsonResponse = await response.json();
  return jsonResponse;
}

function getStartStops(){
  let input = document.getElementById("startSelect").value;
  if(input.length > 1){
  let url = `https://${dbServer}/locations?query=${encodeURIComponent(input)}&poi=false&addresses=false`;
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4){
      if(this.status == 200) {
        //clear the drop down and add
        var response = JSON.parse(this.responseText);
        let options = '';
        for(var i=0;i<response.length;i++){
          const stop = response[i];
          fromToStopsMap[response[i]["name"]] = {'lat':response[i]["location"]["latitude"],'lng':response[i]["location"]["longitude"],'stationId':response[i]["id"]};
          options += `<option lat="${response[i]["location"]["latitude"]}" lng="${response[i]["location"]["longitude"]}" stationId="${response[i]["id"]}">${response[i]["name"]}</option>`;
        };
        document.getElementById("startList").innerHTML = options;
      }
      else if(this.status > 399){
        document.getElementById("fromToResults").innerHTML = "hmm, something went wrong... maybe time to put the kettle on";
      } 
    }
  };
  xmlhttp.open("GET", url, true);
  xmlhttp.send();
  }
}

function setStartValue(){
	console.log("setStartValue");
  if(!fromToStopsMap[document.getElementById("startSelect").value]){
    const reOption = RegExp('>([^<]+)<', 'g');
    if(options = reOption.exec(document.getElementById("startList").innerHTML)){
      document.getElementById("startSelect").value = options[1];
	  enableFindFabRoutes();
    }
  }
}

function setDestinationValue(){
	console.log("setDestinationValue");
  if(!fromToStopsMap[document.getElementById("destinationSelect").value]){
    const reOption = RegExp('>([^<]+)<', 'g');
    if(options = reOption.exec(document.getElementById("destinationList").innerHTML)){
      document.getElementById("destinationSelect").value = options[1];
  	  enableFindFabRoutes();
    }
  } 
}

function enableFindFabRoutes(){
  if(fromToStopsMap[document.getElementById("startSelect").value] && fromToStopsMap[document.getElementById("destinationSelect").value]){
    document.getElementById("findFabRoutes").disabled = false
  }
}

function getDestinationStops(){
  let input = document.getElementById("destinationSelect").value;
  if(input.length > 1){
  let url = `https://${dbServer}/locations?query=${encodeURIComponent(input)}&poi=false&addresses=false`;
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4){
      if(this.status == 200) {
        //clear the drop down and add
        var response = JSON.parse(this.responseText);
        //console.log("processing start stops");
        //console.log(this.responseText);
        let options = '';
        for(var i=0;i<response.length;i++){
          fromToStopsMap[response[i]["name"]] = {'lat':response[i]["location"]["latitude"],'lng':response[i]["location"]["longitude"],'stationId':response[i]["id"]};
          options += `<option lat="${response[i]["location"]["latitude"]}" lng="${response[i]["location"]["longitude"]}" stationId="${response[i]["id"]}">${response[i]["name"]}</option>`;
        };
        document.getElementById("destinationList").innerHTML = options;
      }
      else if(this.status==503){
        document.getElementById("fromToResults").innerHTML = "hmm, something went wrong... maybe time to put the kettle on";
      } 
    }
  };

  xmlhttp.open("GET", url, true);
  xmlhttp.send();
  }
}

function findFabRoutes(){
  if(popup){popup.close();}
  let startStation = fromToStopsMap[document.getElementById("startSelect").value];
  let destinationStation = fromToStopsMap[document.getElementById("destinationSelect").value];

  if(!map.hasLayer(fromToStartPoint)){map.addLayer(fromToStartPoint);}
  if(!map.hasLayer(fromToDestination)){map.addLayer(fromToDestination);}
  if(!map.hasLayer(fromToLines)){map.addLayer(fromToLines);}
  if(!map.hasLayer(fromToStops)){map.addLayer(fromToStops);}
  fromToStartPoint.clearLayers();
  fromToDestination.clearLayers();
  fromToLines.clearLayers();
  fromToStops.clearLayers();
  document.getElementById("fromToResults").innerHTML = "";
    //add a start marker
    let my_icon = L.icon({iconUrl: `/static/icons/home.png`,iconSize: [24, 24], iconAnchor: [12,24]});
    let marker = L.marker([startStation.lat, startStation.lng],{icon:my_icon});
    marker.properties = startStation;
    marker.bindTooltip(document.getElementById("startSelect").value);
    marker.addTo(fromToStartPoint);

    //add a destination marker
    my_icon = L.icon({iconUrl: `/static/icons/destination.png`,iconSize: [24, 24], iconAnchor: [12,24]});
    marker = L.marker([destinationStation.lat, destinationStation.lng],{icon:my_icon});
    marker.properties = destinationStation;
    marker.bindTooltip(document.getElementById("destinationSelect").value);
    marker.addTo(fromToDestination);
    getJourneysWithTime(startStation.stationId,destinationStation.stationId);
}

function getLiveStops(){
  let input = document.getElementById("liveSelect").value;
  if(input.length > 1){
  let url = `https://${dbServer}/locations?query=${encodeURIComponent(input)}&poi=false&addresses=false`;
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4){
      if(this.status == 200) {
        //clear the drop down and add
        var response = JSON.parse(this.responseText);
        //console.log("processing start stops");
        //console.log(this.responseText);
        let options = '';
        for(var i=0;i<response.length;i++){
          if(response[i]["id"]){
            if(response[i]["name"] != response[i]["name"].toUpperCase()){
              fromToStopsMap[response[i]["name"]] = {'lat':response[i]["location"]["latitude"],'lng':response[i]["location"]["longitude"],'stationId':response[i]["id"]};
              options += `<option>${response[i]["name"]}</option>`;  
            }
          }
        };
        document.getElementById("liveList").innerHTML = options;
      }
      else if(this.status>399){
        document.getElementById("routes_from_places").innerHTML = "hmm, something went wrong... maybe time to put the kettle on";
      } 
    }
  };

  xmlhttp.open("GET", url, true);
  xmlhttp.send();
  }
}

function getLiveDepartures(){
  if(!fromToStopsMap[document.getElementById("liveSelect").value]){
    const reOption = RegExp('>([^<]+)<', 'g');
    if(options = reOption.exec(document.getElementById("liveList").innerHTML)){
      document.getElementById("liveSelect").value = options[1];
    }
  }
  if(fromToStopsMap[document.getElementById("liveSelect").value]){
    document.getElementById("routes_from_places").innerHTML = "";
    let heading = `<h5>Departures from ${document.getElementById("liveSelect").value}</h5>`
    document.getElementById("routes_from_places").insertAdjacentHTML('beforeend',heading);
    getDepartures(fromToStopsMap[document.getElementById("liveSelect").value]["stationId"]);
  }
}

function hideSidepanal() {
  var sp = document.getElementById("mySidepanelLeft");
  if (sp.classList.contains("opened")) {
    sp.classList.remove("opened")
    sp.classList.add("closed")
  } else {
    sp.classList.add("closed")
  }
}

function showSidepanelTab(tabName) {
  //open sidepanel
  var sp = document.getElementById("mySidepanelLeft");
  if (sp.classList.contains("closed")) {
    sp.classList.remove("closed");
    sp.classList.add("opened");
  }
  else {
    sp.classList.add("opened")
  }
  //make the tab active
  var spc = document.getElementsByClassName("sidebar-tab-link");
  for(var i=0;i<spc.length;i++){
    if (spc[i].classList.contains("active")) {
      spc[i].classList.remove("active")
    }
  }
  for(var i=0;i<spc.length;i++){
    if (spc[i].attributes["data-tab-link"].value==tabName){
      if (!spc[i].classList.contains("active")) {
        spc[i].classList.add("active")
      }
    }  
  }
   //make the tab active
   var spc = document.getElementsByClassName("sidepanel-tab-content");
   for(var i=0;i<spc.length;i++){
     if (spc[i].classList.contains("active")) {
      //save the last scroll top
      lastScrollTop[spc[i].attributes['data-tab-content'].value] = document.getElementsByClassName("sidepanel-content-wrapper")[0].scrollTop;
      if (!["tab-travel-details","tab-place"].includes(spc[i].attributes['data-tab-content'].value)){
        lastTab = spc[i].attributes['data-tab-content'].value;
      }
      spc[i].classList.remove("active");
     }
   }
   for(var i=0;i<spc.length;i++){
     if (spc[i].attributes["data-tab-content"].value==tabName){
       if (!spc[i].classList.contains("active")) {
         spc[i].classList.add("active");
         if(tabName in lastScrollTop){
          document.getElementsByClassName("sidepanel-content-wrapper")[0].scrollTop = lastScrollTop[tabName];
         }
         else{
          document.getElementsByClassName("sidepanel-content-wrapper")[0].scrollTop = 0;
         }
       }
     }  
   } 
}

function getAgencyLookup(){
  var xmlhttp = new XMLHttpRequest();
  var url = `/static/agency_lookup.json`;
  xmlhttp.onreadystatechange = function() {
  if (this.readyState == 4 && this.status == 200) {
    var response = JSON.parse(this.responseText);
    agencyLookup = response;
    //now we have a set of hops we can show the start points
  }};

  xmlhttp.open("GET", url, true);
  xmlhttp.send();

}

function getInspiredTrips(){
  var xmlhttp = new XMLHttpRequest();
  var url = `/static/trips.json`;
  xmlhttp.onreadystatechange = function() {
  if (this.readyState == 4 && this.status == 200) {
    var response = JSON.parse(this.responseText);
    inspiredTrips = response;
    Object.entries(inspiredTrips).forEach((entry) => {
      const [id, trip] = entry;
      var element = `
      <div class="col">
      <div class="card">
        <img src="${trip["trip_image"]}" class="card-img-top" alt="trip image">
        <div class="card-img-overlay">
          <a href="#" class="triptitle" onclick="showInspiredRoute('${id}')">${trip.trip_title}</a>
        </div>
        <div class="card-body">
          <p class="card-text">${trip.trip_description}</p>
        </div>
      </div>
      </div>
      `
      document.getElementById("inspireBody").insertAdjacentHTML('beforeend', element);
    });
  }};

  xmlhttp.open("GET", url, true);
  xmlhttp.send();
}

function zoomToPlace(id){
  place = all_places[id];
  map.flyTo([place.place_lat, place.place_lon]);
}

function showTripParts(id){
  document.getElementById(`inspireDetailsBody`).innerHTML = "";
  document.getElementById(`inspireTitle`).innerHTML = inspiredTrips[id].trip_title;
  var trip_hops = inspiredTrips[id]["hops"];
  for(var i=0;i<trip_hops.length;i++){
    place = all_places[trip_hops[i]["place_id"]];
    var element = `
    <div class="card mb-3">
      <img src="${trip_hops[i]["hop_image"]}" class="img-fluid rounded-start" alt="hop image" title="${trip_hops[i]["hop_image_attribution"]}">
      <div class="card-text">
      <!--<h4 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">${place["place_name"]}</h4>-->
      <a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff";" onclick="openPlaceDetails('${place["place_id"]}')">${place["place_name"]}</a>
      <p class="card-text">${trip_hops[i]["hop_description"]}</p>
      <a target="_blank" href="${trip_hops[i]["link"]}">${trip_hops[i]["link_text"]}</a>
      </div>
    </div>`
    document.getElementById(`inspireDetailsBody`).insertAdjacentHTML('beforeend', element);
  }
  showSidepanelTab('tab-inspire-details');
}

function showHomeTab(){
  if(popup){popup.close();}
  map.setView([45, 10], 5);
  if(map.hasLayer(possibleFromToStartPoints)){map.removeLayer(possibleFromToStartPoints);}
  if(map.hasLayer(possibleFromToEndPoints)){map.removeLayer(possibleFromToEndPoints);}
  if(map.hasLayer(fromToStartPoint)){map.removeLayer(fromToStartPoint);}
  if(map.hasLayer(fromToDestination)){map.removeLayer(fromToDestination);}
  if(map.hasLayer(fromToLines)){map.removeLayer(fromToLines);}
  if(map.hasLayer(fromToStops)){map.removeLayer(fromToStops);}

  if(map.hasLayer(possibleInspiredTrip)){map.removeLayer(possibleInspiredTrip);}
  if(map.hasLayer(possibleInspiredTripRouteLines)){map.removeLayer(possibleInspiredTripRouteLines);}

  //if(map.hasLayer(liveStop)){map.removeLayer(liveStop);}
  if(map.hasLayer(liveStops)){map.removeLayer(liveStops);}
  if(map.hasLayer(liveRouteLines)){map.removeLayer(liveRouteLines);}

  if(hops.getLayers().length > 0){ 
    buildSummary();
    if(map.hasLayer(freestyleStartPoints)){map.removeLayer(freestyleStartPoints);}

    if(!map.hasLayer(possibleHops)){map.addLayer(possibleHops);}
    if(!map.hasLayer(hops)){map.addLayer(hops);}
    if(!map.hasLayer(routeLines)){map.addLayer(routeLines);}
    document.getElementById("homeWelcome").hidden=true;
    document.getElementById("freestyleBody").hidden=false;
  }
   else{ 
    if(!map.hasLayer(freestyleStartPoints)){map.addLayer(freestyleStartPoints);}
    if(map.hasLayer(possibleHops)){map.removeLayer(possibleHops);}
    if(map.hasLayer(hops)){map.removeLayer(hops);}
    if(map.hasLayer(routeLines)){map.removeLayer(routeLines);}
    document.getElementById("homeWelcome").hidden=false;
    document.getElementById("freestyleBody").hidden=true;
  }
  if(localStorage.getItem("trips") && localStorage.getItem("trips").length>2){
    document.getElementById("savedTripDiv").hidden=false;
    showSavedTrips();
  }
  else{
    document.getElementById("savedTripDiv").hidden=true;
  }
  showSidepanelTab('tab-home');
}

function showInspireTab(){
  if(popup){popup.close();}
  map.setView([45, 10], 5);
  if(map.hasLayer(possibleFromToStartPoints)){map.removeLayer(possibleFromToStartPoints);}
  if(map.hasLayer(possibleFromToEndPoints)){map.removeLayer(possibleFromToEndPoints);}
  if(map.hasLayer(fromToStartPoint)){map.removeLayer(fromToStartPoint);}
  if(map.hasLayer(fromToDestination)){map.removeLayer(fromToDestination);}
  if(map.hasLayer(fromToLines)){map.removeLayer(fromToLines);}
  if(map.hasLayer(fromToStops)){map.removeLayer(fromToStops);}

  //if(map.hasLayer(liveStop)){map.removeLayer(liveStop);}
  if(map.hasLayer(liveStops)){map.removeLayer(liveStops);}
  if(map.hasLayer(liveRouteLines)){map.removeLayer(liveRouteLines);}

  if(map.hasLayer(freestyleStartPoints)){map.removeLayer(freestyleStartPoints);}
  if(map.hasLayer(possibleHops)){map.removeLayer(possibleHops);}
  if(map.hasLayer(hops)){map.removeLayer(hops);}
  if(map.hasLayer(routeLines)){map.removeLayer(routeLines);}

  if(!map.hasLayer(possibleInspiredTrip)){map.addLayer(possibleInspiredTrip);}
  if(!map.hasLayer(possibleInspiredTripRouteLines)){map.addLayer(possibleInspiredTripRouteLines);}
  //to avoid worry about loosing a trip
  if(possibleInspiredTrip.getLayers().length == 0 && hops.getLayers().length > 0){
    //show tooltip for frog
    popup_text = `
    <div>
    <div class="card-body">Wondering where your existing trip has gone?
    <br>Just click on the frog at any time to hop back.
    </div>
   </div>`
    popup = L.popup().setLatLng([45,10]).setContent(popup_text).openOn(map); 

  }
  showSidepanelTab('tab-inspire');
}

function showDestinationTab(){
  if(popup){popup.close();}
  map.setView([45, 10], 5);
  if(fromToLines.getLayers().length == 0){
    if(!map.hasLayer(possibleFromToStartPoints)){map.addLayer(possibleFromToStartPoints);}
  }
  else{
    if(!map.hasLayer(fromToStartPoint)){map.addLayer(fromToStartPoint);}
    if(!map.hasLayer(fromToDestination)){map.addLayer(fromToDestination);}
    if(!map.hasLayer(fromToLines)){map.addLayer(fromToLines);}  
    if(!map.hasLayer(fromToStops)){map.addLayer(fromToStops);}
  }

  //if(map.hasLayer(liveStop)){map.removeLayer(liveStop);}
  if(map.hasLayer(liveStops)){map.removeLayer(liveStops);}
  if(map.hasLayer(liveRouteLines)){map.removeLayer(liveRouteLines);}

  if(map.hasLayer(freestyleStartPoints)){map.removeLayer(freestyleStartPoints);}
  if(map.hasLayer(possibleHops)){map.removeLayer(possibleHops);}
  if(map.hasLayer(hops)){map.removeLayer(hops);}
  if(map.hasLayer(routeLines)){map.removeLayer(routeLines);}

  if(map.hasLayer(possibleInspiredTrip)){map.removeLayer(possibleInspiredTrip);}
  if(map.hasLayer(possibleInspiredTripRouteLines)){map.removeLayer(possibleInspiredTripRouteLines);}
  showSidepanelTab('tab-destination');
}

function showLiveTab(){
  if(popup){popup.close();}
  map.setView([45, 10], 5);
  if(map.hasLayer(possibleFromToStartPoints)){map.removeLayer(possibleFromToStartPoints);}
  if(map.hasLayer(possibleFromToEndPoints)){map.removeLayer(possibleFromToEndPoints);}
  if(map.hasLayer(fromToStartPoint)){map.removeLayer(fromToStartPoint);}
  if(map.hasLayer(fromToDestination)){map.removeLayer(fromToDestination);}
  if(map.hasLayer(fromToLines)){map.removeLayer(fromToLines);}
  if(map.hasLayer(fromToStops)){map.removeLayer(fromToStops);}

  if(!map.hasLayer(liveRouteLines)){map.addLayer(liveRouteLines);}  
  if(!map.hasLayer(liveStops)){map.addLayer(liveStops);}

  if(map.hasLayer(freestyleStartPoints)){map.removeLayer(freestyleStartPoints);}
  if(map.hasLayer(possibleHops)){map.removeLayer(possibleHops);}
  if(map.hasLayer(hops)){map.removeLayer(hops);}
  if(map.hasLayer(routeLines)){map.removeLayer(routeLines);}

  if(map.hasLayer(possibleInspiredTrip)){map.removeLayer(possibleInspiredTrip);}
  if(map.hasLayer(possibleInspiredTripRouteLines)){map.removeLayer(possibleInspiredTripRouteLines);}

  showSidepanelTab('tab-live-departures');
}

function _starterMarkerOnClick(e) {
  hops.clearLayers();
  routeLines.clearLayers();
  var my_icon = L.icon({iconUrl: `/static/icons/home.png`,iconSize: [24, 24], iconAnchor: [12,24]});
  var marker = L.marker([e.latlng.lat, e.latlng.lng],{icon:my_icon});
  marker.properties = e.sourceTarget.properties;
  marker.properties.hop_count = 1;
  marker.bindTooltip(marker.properties.place_name);
  marker.addTo(hops);
  getHops(e.sourceTarget.properties.place_id);
  showHomeTab();
  map.flyTo([e.latlng.lat, e.latlng.lng], 5);
}

function _markerOnClick(e) {
  //get the properties of the place marked
  candidateHop = e.sourceTarget.properties;
  place = all_places[candidateHop.place_id];
  setPlaceDetails(candidateHop.place_id);
  // unpack the travel details
  var block = get_travel_details_block(candidateHop.details);
  document.getElementById("travel_details_body").innerHTML = `<h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">${hops.getLayers()[hops.getLayers().length -1].properties.place_name} to ${place.place_name}</h5>${block}`;
  let badge = ""
  //features
  if (lookup['places_with_world_heritage_sites'][place.place_id]){
    badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">World Heritage</span>`;
   } 
  if (lookup['places_with_ao'][place.place_id]){
     badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Atlas Obscura</span>`;
   } 
  if (lookup['places_with_swims'][place.place_id]){
     badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Wild swimming</span>`;
   }  
  if (lookup['places_with_videos'][place.place_id]){
    badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Video</span>`;
  }  
  if (lookup['places_with_strolls'][place.place_id]){
    badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Station strolls</span>`;
  }  

  popup_text = `
    <div class="card mb-3">
     <img src="${place.place_image}" class="img-fluid rounded-start" style="max-height:250px" alt="${place.place_name}" title = "${place.image_attribution}">
     <div class="card-img-overlay">
       <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div><div class="col-3"><button type="button" class="btn btn-success btn-sm" onclick="_addToTrip()">Add</button></div></div>
     </div>
     <ul class="list-group list-group-flush">
      <li class="list-group-item">${decodeURIComponent(place.place_brief_desc)} <a href="#" onclick="showSidepanelTab('tab-place')"> more...</a>${badge}</li>
      <li class="list-group-item">Journey times from: ${format_duration(candidateHop.duration_min)} <a href="#" onclick="showSidepanelTab('tab-travel-details')"> more...</a></li>
     </ul>
    </div>`
//openPlaceDetails();
popup = L.popup().setLatLng([e.latlng.lat,e.latlng.lng]).setContent(popup_text).openOn(map); 
}

function _addToTrip(){
  //they've chose to add the previewed place
  if(popup){popup.close();}
  hops_items = hops.getLayers();
  var last_hop;
  last_hop = all_places[hops_items[hops_items.length-1].properties.place_id];
  pointA = new L.LatLng(parseFloat(last_hop.place_lat), parseFloat(last_hop.place_lon));
  pointB = new L.LatLng(parseFloat(candidateHop.place_lat), parseFloat(candidateHop.place_lon));
  var pointList = [pointA, pointB];
  new_line = new L.Polyline(pointList, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});
  new_line.addTo(routeLines);

  //add to the hops layer
  var my_icon = L.icon({iconUrl: `/static/icons/triphop.png`,iconSize: [24, 24], iconAnchor: [12,24]});
  var marker = L.marker([parseFloat(candidateHop.place_lat), parseFloat(candidateHop.place_lon)],{icon:my_icon});
  //add property for its count
  hop = all_places[candidateHop.place_id];
  marker.properties = hop;
  marker.properties.from_place_id = last_hop.place_id;
  marker.properties.hop_count = hops_items.length + 1;
  marker.bindTooltip(hop.place_name);
  marker.addEventListener('click', _hopOnClick);
  marker.addTo(hops);
  getHops(candidateHop.place_id);
  buildSummary();
}

function _hopOnClick(e) {
  var hop = e.sourceTarget.properties;
  place = all_places[hop.place_id];
  setPlaceDetails(hop.place_id);
  var travel_details = get_travel_details(hop.from_place_id,hop.place_id)
  var block = get_travel_details_block(travel_details.details);
  document.getElementById("travel_details_body").innerHTML = `<h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">${all_places[hop.from_place_id].place_name} to ${place.place_name}</h5>${block}`;

  let badge = ""
  //world heritage
  if (lookup['places_with_world_heritage_sites'][place.place_id]){
    badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">World Heritage</span>`;
   } 
   if (lookup['places_with_ao'][place.place_id]){
     badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Atlas Obscura</span>`;
   } 
   if (lookup['places_with_swims'][place.place_id]){
     badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Wild swimming</span>`;
   }  
   if (lookup['places_with_videos'][place.place_id]){
    badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Video</span>`;
  }  
  if (lookup['places_with_strolls'][place.place_id]){
    badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Station strolls</span>`;
  }  
  popup_text = `
  <div class="card mb-3">
  <img src="${place.place_image}" class="img-fluid rounded-start" alt="${place.place_name}" title = "${place.image_attribution}">
  <div class="card-img-overlay">
    <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div><div class="col-4"></div></div>
  </div>
  <ul class="list-group list-group-flush">
   <li class="list-group-item">${decodeURIComponent(place.place_brief_desc)} <a href="#" onclick="showSidepanelTab('tab-place')"> more...</a> ${badge}</li>
   <li class="list-group-item">Journey times from: ${format_duration(travel_details.duration_min)} <a href="#" onclick="showSidepanelTab('tab-travel-details')"> more...</a></li>
  </ul>
 </div>
  `
  //openPlaceDetails();
  popup = L.popup().setLatLng([e.latlng.lat,e.latlng.lng]).setContent(popup_text).openOn(map); 
}

function _inspireHopOnClick(e) {
  var hop = e.sourceTarget.properties;
  place = all_places[hop.place_id];
  setPlaceDetails(hop.place_id);
  var travel_details = get_travel_details(hop.from_place_id,hop.place_id)
  var block = get_travel_details_block(travel_details.details);
  document.getElementById("travel_details_body").innerHTML = `<h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">${all_places[hop.from_place_id].place_name} to ${place.place_name}</h5>${block}`;

  //check if last element
  if(hop.next_hop_index == possibleInspiredTrip.getLayers().length){
    var button = `<button class="btn btn-success btn-sm" onclick="customise('${hop.trip_id}')">Add hop</button>`;
  }
  else{
    var button = `<button class="btn btn-success btn-sm" onclick="showInspiredHop(${hop.next_hop_index})">Next</button>`
  }

  popup_text = `

  <div class="card mb-3">
  <img src="${hop.hop_image}" class="img-fluid rounded-start" style="max-height:250px" alt="hop image" title = "${hop.hop_image_attribution}">
  <div class="card-img-overlay">
    <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div><div class="col-4">${button}</div></div>
  </div>
  <ul class="list-group list-group-flush">
   <li class="list-group-item">${hop.hop_description} <a href="#" onclick="showSidepanelTab('tab-place')"> more...</a></li>
   <li class="list-group-item">Journey times from: ${format_duration(travel_details.duration_min)} <a href="#" onclick="showSidepanelTab('tab-travel-details')"> more...</a></li>
  </ul>
 </div>
  `

  popup = L.popup().setLatLng([place.place_lat,place.place_lon]).setContent(popup_text).openOn(map); 
}

function _startInspireHopOnClick(e) {
  var hop = e.sourceTarget.properties;
  var button = `<button class="btn btn-success btn-sm" onclick="showInspiredHop(${hop.next_hop_index})">Next</button>`
  place = all_places[hop.place_id];
  setPlaceDetails(hop.place_id);

  popup_text = `
  <div class="card mb-3">
  <img src="${hop.hop_image}" class="img-fluid rounded-start" style="max-height:250px" alt="hop image" title = "${hop.hop_image_attribution}">
  <div class="card-img-overlay">
    <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div><div class="col-4">${button}</div></div>
  </div>
  <ul class="list-group list-group-flush">
   <li class="list-group-item">${hop.hop_description}</li>
  </ul>
 </div>
    `

  popup = L.popup().setLatLng([place.place_lat,place.place_lon]).setContent(popup_text).openOn(map); 
}

function showInspiredHop(index){
  var hop = possibleInspiredTrip.getLayers()[index];
  //zoomToPlace(hop.properties.place_id);
  hop.fireEvent('click');
}

function get_travel_details_block(details){
  details_list = `<ul class="list-group list-group-flush">`;
  details.forEach(function (detail) {
    agency_name = detail.agency_name;
    if(agency_name in agencyLookup){
      agency_url = agencyLookup[agency_name];
    }
    else{
      agency_url = "https://omio.tp.st/p3bESwp0";
    }
    transport_type = detail.mode;
    details_list +=`
    <li class="list-group-item">
      <div class="row g-0">
        <div class="col-md-4">
          <img src="/static/icons/${transport_type}.png" class="img-fluid rounded-start" alt="${transport_type}">
        </div>
        <div class="col-md-8">
          <div class="card-body">
            <h5 class="card-title"><a target="_blank" href="${agency_url}" >${agency_name}</a></h5>
            <p class="card-text"><small class="text-body-secondary">Journey time: ${format_duration(detail.duration_min)}</small></p>
            </div>
        </div>
      </div>     
    </li>`;
  });
  details_list += "</ul>";
  return details_list;
}

function get_travel_details(from_place_id, to_place_id){
  var hop;
  all_hops[from_place_id]['hops'].forEach((element) => {
    if(element["place_id"] == to_place_id){
      hop = element;
    }
  });
  return hop;
}

function sortNextHops( a, b ) {
  if ( parseFloat(a.properties.duration_min) < parseFloat(b.properties.duration_min) ){
    return -1;
  }
  if ( parseFloat(a.properties.duration_min) > parseFloat(b.properties.duration_min)){
    return 1;
  }
  return 0;
}

function getHops(id){
  possibleHops.clearLayers();
  let hops_obj = all_hops[id].hops;
  Object.entries(hops_obj).forEach((entry) => {
    const [id, hop] = entry;
    hop.place_name = all_places[hop.place_id].place_name;
    hop.place_lat = all_places[hop.place_id].place_lat;
    hop.place_lon = all_places[hop.place_id].place_lon;
    let my_icon = L.icon({iconUrl: `/static/icons/hop.png`,iconSize: [24, 24], iconAnchor: [12,24]});
    let marker = L.marker([hop.place_lat, hop.place_lon],{icon:my_icon});
    marker.bindTooltip(`${hop.place_name}: ${format_duration(hop.duration_min)}`);
    marker.properties = hop;
    marker.addEventListener('click', _markerOnClick);
    marker.riseOnHover = true;
    //loop through details
    let hopModes = {"train":false,"bus":false,"ferry":false};
    let showHop = true;
    hop.details.forEach(function (detail) {
      hopModes[detail.mode]=true;
    });
    if(modes["train"]=="" && modes["bus"]=="" && modes["ferry"]==""){showHop=false}
    else if(modes["train"]=="" && modes["bus"]==""){if(hopModes["ferry"]==false){showHop=false}}
    else if(modes["train"]=="" && modes["ferry"]==""){if(hopModes["bus"]==false){showHop=false}}
    else if(modes["bus"]=="" && modes["ferry"]==""){if(hopModes["train"]==false){showHop=false}}
    else if(modes["train"]==""){if(hopModes["bus"]==false && hopModes["ferry"]==false){showHop=false}}
    else if(modes["bus"]==""){if(hopModes["train"]==false && hopModes["ferry"]==false){showHop=false}}
    else if(modes["ferry"]==""){if(hopModes["train"]==false && hopModes["bus"]==false){showHop=false}}
    if(showHop){
      marker.addTo(possibleHops);
    }
  });
}

function removeHop(hop_item){
  if(popup){popup.close();}
  var hops_layers = hops.getLayers();
  var ubound = hops_layers.length;
  for(var i=hop_item;i<ubound;i++){
    h = hops.getLayers();
    hops.removeLayer(h[h.length - 1]._leaflet_id);
    layers = routeLines.getLayers();
    routeLines.removeLayer(layers[layers.length - 1]._leaflet_id);
  };
  var hops_layers = hops.getLayers();
  var id = hops_layers[hops_layers.length - 1].properties.place_id;
  possibleHops.clearLayers();
  getHops(id);
  buildSummary();
}

function format_duration(mins){
  //mins = secs/60
  remainder =  mins % 60;
  str_remainder = Math.round(remainder).toString();
  hours = (mins - remainder) / 60;
  return(hours.toString() + ":" + str_remainder.padStart(2, '0'));
}

function openTravelDetails(from_place_id, to_place_id){
  var travel_details = get_travel_details(from_place_id, to_place_id);
  var block = get_travel_details_block(travel_details.details);
  document.getElementById("travel_details_body").innerHTML = `<h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">${all_places[from_place_id].place_name} to ${all_places[to_place_id].place_name}</h5>${block}`;
  showSidepanelTab('tab-travel-details');
}

function openPlaceDetails(place_id){
  place = all_places[place_id];
  setPlaceDetails(place_id);
  showSidepanelTab('tab-place');
}

function showInspiredRoute(routeId){
  possibleInspiredTrip.clearLayers();
  possibleInspiredTripRouteLines.clearLayers();
  //need to go through each part of the route and add to the map
  var trip = inspiredTrips[routeId]["hops"];
  var hop = all_places[trip[0].place_id];
  var my_icon = L.icon({iconUrl: `/static/icons/home.png`, iconSize: [24, 24], iconAnchor: [12,24]});
  var starter_marker = L.marker([parseFloat(hop.place_lat), parseFloat(hop.place_lon)],{icon:my_icon});
  starter_marker.bindTooltip(decodeURI(hop.place_name));
  hop.hop_image = trip[0].hop_image;
  hop.hop_image_attribution = trip[0].hop_image_attribution;
  hop.hop_description = trip[0].hop_description;
  hop.link = trip[0].link;
  hop.link_text = trip[0].link_text;
  hop.trip_id = routeId;
  hop.next_hop_index = 1;
  starter_marker.properties = hop;
  starter_marker.addEventListener('click', _startInspireHopOnClick);
  starter_marker.riseOnHover = true;
  starter_marker.addTo(possibleInspiredTrip);

  for(var i=1;i<trip.length;i++){
    hop = all_places[trip[i].place_id];
    hop.from_place_id = trip[i-1].place_id;
    hop.hop_count = i;
    var my_icon = L.icon({iconUrl: `/static/icons/triphop.png`, iconSize: [24, 24], iconAnchor: [12,24]});
    var marker = L.marker([parseFloat(hop.place_lat), parseFloat(hop.place_lon)],{icon:my_icon});
    marker.bindTooltip(hop.place_name);
    //need to add trip items
    hop.hop_image = trip[i].hop_image;
    hop.hop_image_attribution = trip[i].hop_image_attribution;
    hop.hop_description = trip[i].hop_description;
    hop.link = trip[i].link;
    hop.link_text = trip[i].link_text;
    hop.trip_id = routeId;
    hop.next_hop_index = i + 1;
    marker.properties = hop;
 
    marker.addEventListener('click', _inspireHopOnClick);
    marker.riseOnHover = true;
    marker.addTo(possibleInspiredTrip);

    pointA = new L.LatLng(parseFloat(all_places[trip[i-1].place_id].place_lat), parseFloat(all_places[trip[i-1].place_id].place_lon));
    pointB = new L.LatLng(parseFloat(all_places[trip[i].place_id].place_lat), parseFloat(all_places[trip[i].place_id].place_lon));
    var pointList = [pointA, pointB];
    new_line = new L.Polyline(pointList, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});
    new_line.addTo(possibleInspiredTripRouteLines);  
  }
  map.fitBounds(possibleInspiredTrip.getBounds());
  hideSidepanal();
  //starter_marker.fireEvent('click')
  showTripParts(routeId);
}

function customise(id){
  useThisRoute(id);
}

function useThisRoute(routeId){
  hops.clearLayers();
  routeLines.clearLayers();
  if(popup){popup.close();}
  var trip = inspiredTrips[routeId]["hops"];
  var hop = all_places[trip[0].place_id];
  var my_icon = L.icon({iconUrl: `/static/icons/triphop.png`, iconSize: [24, 24], iconAnchor: [12,24]});
  var marker = L.marker([parseFloat(hop.place_lat), parseFloat(hop.place_lon)],{icon:my_icon});
  marker.bindTooltip(decodeURI(hop.place_name));
  marker.properties = hop;
  marker.riseOnHover = true;
  marker.addTo(hops);

  for(var i=1;i<trip.length;i++){
    hop = all_places[trip[i].place_id];
    hop.from_place_id = trip[i-1].place_id;
    hop.hop_count = i;
    var my_icon = L.icon({iconUrl: `/static/icons/triphop.png`, iconSize: [24, 24], iconAnchor: [12,24]});
    var marker = L.marker([parseFloat(hop.place_lat), parseFloat(hop.place_lon)],{icon:my_icon});
    marker.bindTooltip(hop.place_name);
    marker.properties = hop;
    marker.addEventListener('click', _hopOnClick);
    marker.riseOnHover = true;
    marker.addTo(hops);

    pointA = new L.LatLng(parseFloat(all_places[trip[i-1].place_id].place_lat), parseFloat(all_places[trip[i-1].place_id].place_lon));
    pointB = new L.LatLng(parseFloat(all_places[trip[i].place_id].place_lat), parseFloat(all_places[trip[i].place_id].place_lon));
    var pointList = [pointA, pointB];
    new_line = new L.Polyline(pointList, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});
    new_line.addTo(routeLines);  
  }
  getHops(trip[trip.length-1].place_id);
  possibleInspiredTrip.clearLayers();
  possibleInspiredTripRouteLines.clearLayers();
  showHomeTab();
}

function startAgain(){
  document.getElementById("freestyleBody").innerHTML = "";
  hops.clearLayers();
  routeLines.clearLayers();
  possibleHops.clearLayers();
  showHomeTab();
}

function checkChanged(mode){
 if(document.getElementById(mode).checked){modes[mode] = "checked"}
 else{modes[mode]=""}
 var hops_layers = hops.getLayers();
 var id = hops_layers[hops_layers.length - 1].properties.place_id;
 possibleHops.clearLayers();
 getHops(id);
 buildSummary();
}

function buildSummary(){
  let hops_items = hops.getLayers();
  let freestyleBody = `
  <div class="row justify-content-evenly">
    <div class="col-7">
      <h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">Starting at ${hops_items[0].properties.place_name}</h5></div><div class="col" style="float: right;"><img src="/static/icons/save.png" onclick="checkSavingConsent()" title="save" alt="save">  <img src="/static/icons/delete.png" onclick="startAgain()" title="start again" alt="start again"> <img src="/static/icons/share.png" onclick="share()" title="share" alt="share"> <small id="tripMessage"></small>
    </div>
	<div id="settingsSection">
      <input class="form-check-input" type="checkbox" style="background-color:#ff6600ff" id="train" ${modes["train"]} onchange="checkChanged('train')">
      <label class="form-check-label" for="train">train</label>
      <input class="form-check-input" type="checkbox" style="background-color:#ff6600ff" id="bus" ${modes["bus"]} onchange="checkChanged('bus')">
      <label class="form-check-label" for="bus">coach</label>
      <input class="form-check-input" type="checkbox" style="background-color:#ff6600ff" id="ferry" ${modes["ferry"]} onchange="checkChanged('ferry')">
      <label class="form-check-label" for="ferry">ferry</label>
    </div>

    <div id="consentSection" hidden="true">This will save the trip to your device but not be shared with anyone else. Are you happy to proceed? <button class="btn btn-secondary btn-sm" onclick="giveConsent()">OK</button><button onclick="refuseConsent()" class="btn btn-secondary btn-sm">Not OK</button></div>
  </div>`;
  for(let i=1;i< hops_items.length;i++){
    let removalElement = "";
    if(i == hops_items.length - 1){removalElement = `<button class="btn btn-danger btn-sm" onclick="removeHop('${i}')">remove</button>`;}
    freestyleBody +=`
    <div class="card border-light mb-3 ">
    <div class="row g-0">
      <div class="col-md-12">
        <img src="/static/icons/train.png" class="img-fluid rounded-start" alt="train">
        <a href="#" class="link-dark link-offset-2" onclick="openTravelDetails('${hops_items[i -1].properties.place_id}','${hops_items[i].properties.place_id}')">${hops_items[i -1].properties.place_name} to ${hops_items[i].properties.place_name} travel options</a>
       </div>
    </div>
  </div>`;
    freestyleBody +=`
    <div class="card">
     <img src="${hops_items[i].properties.place_image}" class="img-fluid rounded-start" alt="hop image" title = "${hops_items[i].properties.image_attribution}" onclick="popAndZoom('${hops_items[i].properties.place_id}')">
     <div class="card-img-overlay">
     <div class="row justify-content-evenly"><div class="col"><a href="#" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="popAndZoom('${hops_items[i].properties.place_id}')">${hops_items[i].properties.place_name}</a></div><div class="col-4">${removalElement}</div></div>
    </div>
    </div>`;
    }

    let nextHops = possibleHops.getLayers()
    nextHops.sort( sortNextHops );
    let nextHopSummary = `<div class="card"><div class="card-header">Where next? <span onclick="chooseRandomPlace()" class="badge text-bg-secondary">Lucky dip!</span></div><div class="card-body">`;
    for(let i=0;i<nextHops.length;i++){
      nextHopSummary += `
      <div class="row justify-content-evenly">
      <div class="col">   
        <a href="#" class="candidates" onclick="popupHop('${nextHops[i].properties.place_id}')">${nextHops[i].properties.place_name}</a>
      </div>
      <div class="col">   
        <a href="#" onclick="openTravelDetails('${hops_items[hops_items.length-1].properties.place_id}','${nextHops[i].properties.place_id}')">${format_duration(Math.round(nextHops[i].properties.duration_min))}</a>
      </div>    
      </div>`; 
    }
    nextHopSummary += `</div></div>`;
    freestyleBody += nextHopSummary;
    document.getElementById("freestyleBody").innerHTML = freestyleBody;
}

function popAndZoom(id){
 zoomToPlace(id);
 openPlaceDetails(id);
}

function showWholeInspiredRoute(){
  map.fitBounds([possibleInspiredTrip.getLayers()[0].getLatLng(),possibleInspiredTrip.getLayers()[possibleInspiredTrip.getLayers().length-1].getLatLng()])
}

function showWholeMap(){
  map.fitBounds(possibleHops)
}

function popupHop(place_id) {
  //loop through the possible hops
  let ph = possibleHops.getLayers();
  for(let i=0;i<ph.length;i++){
    if(ph[i].properties.place_id ==place_id){
      candidateHop = ph[i].properties;
    }
  }
  //get the properties of the place marked
  place = all_places[candidateHop.place_id];
  setPlaceDetails(candidateHop.place_id);
  // unpack the travel details
  var block = get_travel_details_block(candidateHop.details);
  document.getElementById("travel_details_body").innerHTML = `<h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">${hops.getLayers()[hops.getLayers().length -1].properties.place_name} to ${place.place_name}</h5>${block}`;

  popup_text = `
    <div class="card mb-3">
     <img src="${place.place_image}" class="img-fluid rounded-start" style="max-height:250px" alt="place image" title = "${place.image_attribution}">
     <div class="card-img-overlay">
       <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div><div class="col-3"><button type="button" class="btn btn-success btn-sm" onclick="_addToTrip()">Add</button></div></div>
     </div>
     <ul class="list-group list-group-flush">
      <li class="list-group-item">${decodeURIComponent(place.place_brief_desc)} <a href="#" onclick="showSidepanelTab('tab-place')"> more...</a></li>
      <li class="list-group-item">Journey times from: ${format_duration(candidateHop.duration_min)} <a href="#" onclick="showSidepanelTab('tab-travel-details')"> more...</a></li>
     </ul>
    </div>`
  hideSidepanal();
  popup = L.popup().setLatLng([place.place_lat,place.place_lon]).setContent(popup_text).openOn(map); 

}

function _fromMarkerOnClick(e) {
  //get the properties of the place marked
  candidateHop = e.sourceTarget.properties;
  place = all_places[candidateHop.place_id];

  setPlaceDetails(candidateHop.place_id);

  popup_text = `
        <p>${place.place_name}</p>
        <button type="button" style="background-color:#abc837ff" class="btn btn-success btn-sm" onclick="_setStartpoint('${place.place_id}')">Start here</button>`;
  popup = L.popup().setLatLng([e.latlng.lat,e.latlng.lng]).setContent(popup_text).openOn(map); 
}

function _destinationMarkerOnClick(e) {
  //get the properties of the place marked
  candidateHop = e.sourceTarget.properties;
  place = all_places[candidateHop.place_id];
  setPlaceDetails(candidateHop.place_id);

  popup_text = `
      <p>${place.place_name}</p>
      <button type="button" style="background-color:#abc837ff" class="btn btn-success btn-sm" onclick="_setDestination('${place.place_id}')">Destination</button>`
  popup = L.popup().setLatLng([e.latlng.lat,e.latlng.lng]).setContent(popup_text).openOn(map); 
}

function _setStartpoint(place_id){
  if(popup){popup.close()}
  map.removeLayer(possibleFromToStartPoints);
  map.addLayer(possibleFromToEndPoints);
  //document.getElementById("startSelect").value = place_id;
  startSelect.setSelected(place_id);
}

function _setDestination(place_id){
  if(popup){popup.close()}
  //document.getElementById("destinationSelect").value = place_id;
  destinationSelect.setSelected(place_id);
  findFabRoutes();
}

function _routeHopOnClick(e) {
  var hop = e.sourceTarget.properties;
  place = all_places[hop.place_id];
  setPlaceDetails(hop.place_id);
  var travel_details = get_travel_details(hop.from_place_id,hop.place_id);
  var block = get_travel_details_block(travel_details.details);
  document.getElementById("travel_details_body").innerHTML = `<h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">${all_places[hop.from_place_id].place_name} to ${place.place_name}</h5>${block}`;

  //check if last element
  popup_text = `
  <div class="card mb-3">
  <img src="${hop.hop_image}" class="img-fluid rounded-start" style="max-height:250px" alt="hop image" title = "${hop.hop_image_attribution}">
  <div class="card-img-overlay">
    <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div></div>
  </div>
  <ul class="list-group list-group-flush">
   <li class="list-group-item">${hop.hop_description} <a href="#" onclick="showSidepanelTab('tab-place')"> more...</a></li>
   <li class="list-group-item">Journey times from: ${format_duration(travel_details.duration_min)} <a href="#" onclick="showSidepanelTab('tab-travel-details')"> more...</a></li>
  </ul>
 </div>
  `
  popup = L.popup().setLatLng([place.place_lat,place.place_lon]).setContent(popup_text).openOn(map); 
}

function clearAllLayers(){
  hops.clearLayers();
  fromToStartPoint.clearLayers();
  fromToDestination.clearLayers();
  routeLines.clearLayers();
  possibleInspiredTrip.clearLayers();
  possibleInspiredTripRouteLines.clearLayers();
  possibleHops.clearLayers();
  freestyleStartPoints.clearLayers();
  possibleFromToStartPoints.clearLayers();
  possibleFromToEndPoints.clearLayers();
  liveRouteLines.clearLayers();
  liveStops.clearLayers();
}

function toRadians (angle) {
  return angle * (Math.PI / 180);
}

function distanceBetweenTwoPoints(from_lat,from_lon,to_lat,to_lon){
    from_lat_rad = toRadians(parseFloat(from_lat))
    from_lon_rad = toRadians(parseFloat(from_lon))
    to_lat_rad = toRadians(parseFloat(to_lat))
    to_lon_rad = toRadians(parseFloat(to_lon))
    dist_lon = to_lon_rad - from_lon_rad
    dist_lat = to_lat_rad - from_lat_rad

    a = Math.sin(dist_lat / 2)**2 + Math.cos(from_lat_rad) * Math.cos(to_lat_rad) * Math.sin(dist_lon / 2)**2
    c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    // Approximate radius of earth in km
    R = 6373.0
    distance = R * c
    return distance
}

async function getJourneysWithTime(from_stop_id,to_stop_id) {
  document.getElementById("spinner").hidden = false;
  let depart = Date.parse(document.getElementById("departureTime").value)/1000;
  let url = `https://${dbServer}/journeys?departure=${depart}&from=${from_stop_id}&to=${to_stop_id}&results=3&stopovers=false&transferTime=0&bike=false&startWithWalking=true&walkingSpeed=normal&tickets=false&polylines=false&subStops=true&entrances=true&remarks=true&scheduledDays=false&language=en&firstClass=false`;
  const response = await fetch(url);
  if(response.status == 200){
    const jsonResponse = await response.json();
    const journeys = jsonResponse.journeys;
    for(let i=0;i<journeys.length;i++){
      const legs = journeys[i].legs;
      document.getElementById("fromToResults").insertAdjacentHTML("beforeend",`<div id="${from_stop_id}_${to_stop_id}_${i+1}"></div>`);
      document.getElementById(`${from_stop_id}_${to_stop_id}_${i+1}`).insertAdjacentHTML("beforeend",`<h5>Option ${i+1}</h5>`);    
      for(let j=0;j<legs.length;j++){
        document.getElementById("fromToResults").insertAdjacentHTML("beforeend",`<div id="${from_stop_id}_${to_stop_id}_${i+1}_${j+1}"></div>`);
        let leg = legs[j];
        if("line" in leg){
          if(leg.tripId){
            openRequestCount ++;
            document.getElementById("spinner").hidden = false;
            setTimeout(getTrips,600*j,leg,`${from_stop_id}_${to_stop_id}_${i+1}_${j+1}`);
        }  
      }
      }
    }
  }
  else if(response.status > 399){
    document.getElementById("fromToResults").innerHTML = "hmm, something went wrong... maybe time to put the kettle on";
  } 
}

function getDepartures(from_stop_id,duration=1440){
  liveRouteLines.clearLayers();
  liveStops.clearLayers();
  if(popup){popup.close();}

  if(!map.hasLayer(liveRouteLines)){map.addLayer(liveRouteLines);}
  let place_id = stopsPlacesLookup[from_stop_id];
  let place = all_places[place_id];

  trips = {};
  var url=`https://${dbServer}/stops/${from_stop_id}/departures?duration=${duration}`
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4){
      if(this.status == 200) {
        var response = JSON.parse(this.responseText).departures;
        for(var i=0;i<response.length;i++){
          const departure = response[i];
          trip_id = departure["tripId"];
          line_name = departure["line"]["name"];
          openRequestCount ++;
          document.getElementById("departures_spinner").hidden = false;
          setTimeout(getLiveTrips,600*i,from_stop_id,trip_id,line_name);
        };
      }
      else if(this.status > 399){
        document.getElementById("routes_from_places").innerHTML = "hmm, something went wrong... maybe time to put the kettle on";
      } 
    }
  };

  xmlhttp.open("GET", url, true);
  xmlhttp.send();

}

function getLiveTrips(from_stop_id,trip_id,line_name){
  let url=`https://${dbServer}/trips/${encodeURIComponent(trip_id)}?lineName=${encodeURIComponent(line_name)}`
  let xmlhttp = new XMLHttpRequest();

  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4){
      openRequestCount --;
      if(openRequestCount ==0){document.getElementById("departures_spinner").hidden=true;}
      if(this.status == 200) {
      let trip = JSON.parse(this.responseText).trip;
      trips[encodeURIComponent(trip_id)] = trip;
      trips[encodeURIComponent(trip_id)].fabHops = [];

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
        let fabHops = [];
          for(let i=0;i<stopovers.length;i++){
            if(stopovers[i].stop.id==from_stop_id){
              from_stop_id_noted = true;
              from_stop_id_index = i;
            } 
            let timestamp = "";
            if(i==0){stopovers[i].timestamp = stopovers[i].plannedDeparture;}
            else{
              if(stopovers[i].plannedArrival){
              stopovers[i].timestamp = stopovers[i].plannedArrival;
              }
              else{stopovers[i].timestamp = stopovers[i].plannedDeparture;}
            }
            if(from_stop_id_noted){
              let badge = "";
              let onclickFunction = `showPlaceOnMap('${stopovers[i].stop.location.latitude}', '${stopovers[i].stop.location.longitude}','${stopovers[i].stop.name}','${stopovers[i].stop.id}')`;
              Object.entries(all_places).forEach((entry) => {
                const [id, place] = entry;
                if(distanceBetweenTwoPoints(stopovers[i].stop.location.latitude,stopovers[i].stop.location.longitude,place.place_lat,place.place_lon) <= place.lat_lon_tolerance){
                  onclickFunction = `popupPlace('${place.place_id}')`;
                  if (!fabHops.includes(place.place_id)) {
                    fabHops.push(place.place_id);
                    trips[encodeURIComponent(trip_id)].fabHops.push(place);
                  }
                  badge = `<span class="badge text-bg-light">Fab Hop!</span>`;
                }
              });
              //tripCard += `<li class="list-group-item"><a href="#" onclick="${onclickFunction}">${stopovers[i].stop.name} ${badge}</a></li>`
              tripCard += `<li class="list-group-item">${stopovers[i].timestamp.substring(11,19)}: <a href="#" onclick="showPlaceOnMap('${stopovers[i].stop.location.latitude}', '${stopovers[i].stop.location.longitude}','${stopovers[i].stop.name}','${stopovers[i].stop.id}')">${stopovers[i].stop.name}</a></li>`
              latlngs.push([stopovers[i].stop.location.latitude, stopovers[i].stop.location.longitude])
            }
          }
          if(from_stop_id_noted){
            if(fabHops.length > 1){badge = `<span class="badge text-bg-light">${fabHops.length} fab hops!</span>`}
            else if (fabHops.length == 1){badge = `<span class="badge text-bg-light">1 fab hop!</span>`}
            else{badge=""}    
            //need to add this when we have reached the stop
            let tripCardheader = `
            <div class="card">
            <div class="card-header livetrip" onclick="showTripOnMap('${encodeURIComponent(trip_id)}')" timestamp="${stopovers[from_stop_id_index].timestamp.substring(11,19)}">
            ${stopovers[from_stop_id_index].timestamp.substring(11,19)} 
            <a data-bs-toggle="collapse" href="#${encodeURIComponent(trip_id)}" aria-expanded="false" aria-controls="${encodeURIComponent(trip_id)}">
            ${stopovers[from_stop_id_index].stop.name} to ${trip.destination.name}
            </a> ${badge}
            </div>
            <div class="collapse" id="${encodeURIComponent(trip_id)}">
            <div class="card-body">
            <p>${trip.line.mode}
            ${remarks}
            </p>
            <ul class="list-group list-group-flush">
            `;
            document.getElementById("routes_from_places").insertAdjacentHTML('beforeend',`${tripCardheader}${tripCard}</ul></div></div></div>`);
            var polyline = L.polyline(latlngs, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});      
            polyline.bindTooltip(`${trip.origin.name} to ${trip.destination.name}`);
            polyline.addEventListener('click',_liveRouteLineClicked);
            polyline.properties = trip;
            polyline.addTo(liveRouteLines);
          }
        }  
      }
      else if(this.status > 399){
                console.log(`issue getting trip ${trip_id}`);
      } 
    }
  };

  xmlhttp.open("GET", url, true);
  xmlhttp.send();

}

function showPlaceOnMap(lat,lon,placename,stopid){
  let linktext = "";
  let popup_text = "";
  Object.entries(all_places).forEach((entry) => {
    const [id, place] = entry;
    if(distanceBetweenTwoPoints(lat,lon,place.place_lat,place.place_lon) <= place.lat_lon_tolerance){
      let badge = ""
      //world heritage
      if (lookup['places_with_world_heritage_sites'][id]){
        badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">World Heritage</span>`;
       } 
       if (lookup['places_with_ao'][id]){
         badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Atlas Obscura</span>`;
       } 
       if (lookup['places_with_swims'][id]){
         badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Wild swimming</span>`;
       }     
       if (lookup['places_with_videos'][place.place_id]){
        badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Video</span>`;
      }  
      if (lookup['places_with_strolls'][place.place_id]){
        badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Station strolls</span>`;
      }    
      popup_text = `
    <div class="card mb-3">
     <img src="${place.place_image}" class="img-fluid rounded-start" style="max-height:250px" alt="place image" title="${place.image_attribution}" alt="${place.place_name}">
     <div class="card-img-overlay">
       <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div></div>
     </div>
     <ul class="list-group list-group-flush">
      <li class="list-group-item">${decodeURIComponent(place.place_brief_desc)} ${badge}</li>
     </ul>
     
    </div>`
  }

  });
  if(popup_text == ""){
    popup_text = `
    <div>
     <p class="card-text">${placename}</p>
     <!--<a href="#" style="color:#ff6600ff" onclick="getDepartures('${placename}','${stopid}')">get departures from here</a>-->
    </div>`
  }
  popup = L.popup().setLatLng([lat,lon]).setContent(popup_text).openOn(map);
}

function _liveRouteLineClicked(e){
  showTripOnMap(encodeURIComponent(e.sourceTarget.properties.id));
}

function showTripOnMap(tripId){
  let trip = trips[tripId];
  if(trip){
  if("stopovers" in trip){
    let stopovers = trip["stopovers"]
    departureTime = stopovers[0]["plannedDeparture"]
    liveStops.clearLayers();
    latlngs = [];
      for(let i=0;i<stopovers.length;i++){
        let timestamp = "";
        if(stopovers[i].departure){timestamp = stopovers[i].departure};
        if(!timestamp){ timestamp = stopovers[i].arrival}
        latlngs.push([stopovers[i].stop.location.latitude, stopovers[i].stop.location.longitude]);
        /*
        marker = L.circleMarker([stopovers[i].stop.location.latitude, stopovers[i].stop.location.longitude],{radius:4,color:'#ff6600ff'});
        marker.properties = stopovers[i].stop;
        marker.bindTooltip(stopovers[i].stop.name);
        marker.addEventListener('click', _showLiveOnClick);
        marker.addTo(liveStops); 
        */
      }
      trip.fabHops.forEach(fabHop=>{
        my_icon = L.icon({iconUrl: `/static/icons/triphop.png`,iconSize: [24, 24], iconAnchor: [12,24]});
        marker = L.marker([fabHop.place_lat, fabHop.place_lon],{icon:my_icon});
        marker.properties = fabHop;
        marker.bindTooltip(fabHop.place_name);
        marker.addEventListener('click', _showLiveOnClick);
        marker.addTo(liveStops);
      })

      var polyline = L.polyline(latlngs, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});
      liveRouteLines.getLayers().forEach(item=>{
        let decoded = decodeURIComponent(tripId);
        if(item.properties.id == decoded){
          item.setStyle({color: '#ff6600ff',weight: 3,opacity: 1})
          item.bringToFront();
        }
        else{
          item.setStyle({color: '#8a8988',weight: 3,opacity: 0.5})

        }
 
      })
    }}
}

function _showLiveOnClick(e){
  showPlaceOnMap(e.latlng.lat, e.latlng.lng,e.sourceTarget.properties.name,e.sourceTarget.properties.id)
}

function popupPlace(place_id) {
  //get the properties of the place marked
  let place = all_places[place_id];
  setPlaceDetails(place_id);
  let badge = ""
  //world heritage
  if (lookup['places_with_world_heritage_sites'][place_id]){
   badge += `<span class="badge text-bg-light">World Heritage</span>`;
  } 
  if (lookup['places_with_ao'][place_id]){
    badge += `<span class="badge text-bg-light">Atlas Obscura</span>`;
  } 
  if (lookup['places_with_swims'][place_id]){
    badge += `<span class="badge text-bg-light">Wild swimming</span>`;
  }        
  if (lookup['places_with_videos'][place.place_id]){
    badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Video</span>`;
  }  
  if (lookup['places_with_strolls'][place.place_id]){
    badge += `<span class="badge text-bg-light" onclick="openPlaceDetails('${place.place_id}')">Station strolls</span>`;
  }  
  popup_text = `
    <div class="card mb-3">
     <img src="${place.place_image}" class="img-fluid rounded-start" style="max-height:250px" alt="place image" title="${place.image_attribution}" alt="${place.place_name}">
     <div class="card-img-overlay">
       <div class="row justify-content-evenly"><div class="col"><a href="#" class="h3" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="openPlaceDetails('${place.place_id}')">${place.place_name}</a></div></div>
     </div>
     <ul class="list-group list-group-flush">
      <li class="list-group-item">${decodeURIComponent(place.place_brief_desc)} <a href="#" onclick="showSidepanelTab('tab-place')"> more...</a> ${badge}</li>
     </ul>
     
    </div>`
    hideSidepanal()
  popup = L.popup().setLatLng([place.place_lat,place.place_lon]).setContent(popup_text).openOn(map); 
}

function placeNear(lat,lon,place_id){
  let place = all_places[place_id];
  let dist = distanceBetweenTwoPoints(lat,lon,place.place_lat,place.place_lon);
  if(dist <= place.lat_lon_tolerance){
    //console.log(`${dist} near ${place.place_name} ${place.lat_lon_tolerance}`)
    return true;
  }
  else{
    //console.log(`nope ${dist} further than ${place.lat_lon_tolerance}`)
    return false;
  }
}

function revertToPreviousTab(){
  showSidepanelTab(lastTab);
}

function giveConsent(){
  localStorage.setItem("savingConsentGiven",true);
  document.getElementById("consentSection").hidden = true;
  saveTrip();
}

function refuseConsent(){
  document.getElementById("consentSection").hidden = true;
}

function checkSavingConsent(){
  if(localStorage.getItem("savingConsentGiven")){
    saveTrip();
  }
  else{
    document.getElementById("consentSection").hidden = false;
  }
}
function saveTrip(){
  let ids = [];
  let names = [];
	hops.getLayers().forEach(item=>{
    ids.push(item.properties.place_id);
    names.push(item.properties.place_name);
  })
  let id = ids.join('-');
  let item = {"ids":ids,"names":names};
  if(localStorage.getItem("trips")){
    tripString = localStorage.getItem("trips");
    trips = JSON.parse(tripString);
    trips[id] = item;
    localStorage.setItem("trips", JSON.stringify(trips));
  }
  else{
    let trip = {};
    trip[id] = item;
    localStorage.setItem("trips", JSON.stringify(trip));
  }
  document.getElementById("tripMessage").innerHTML = "saved";
  setTimeout(() =>{document.getElementById("tripMessage").innerHTML = ""},3000);
  showSavedTrips();
}
function deleteSavedTrip(id){
  tripString = localStorage.getItem("trips");
  trips = JSON.parse(tripString);
  delete trips[id];
  tripString = JSON.stringify(trips);
  localStorage.setItem("trips",tripString);
  showSavedTrips();
}
function showSavedTrips(){
  document.getElementById("savedTripList").innerHTML = `<ul class="list-group list-group-flush"></ul>`;
  tripString = localStorage.getItem("trips");
  trips = JSON.parse(tripString);
	Object.entries(trips).forEach(trip=>{
    const [id, item] = trip;
    let routenames = item.names;
		summary = `<li class="list-group-item"><a href="#" onclick="showSavedTrip('${id}')">${routenames.join(" > ")}</a> <img src="/static/icons/delete.png" onclick="deleteSavedTrip('${id}')" title="remove" alt="remove"></li>`;
		document.getElementById("savedTripList").insertAdjacentHTML('beforeend',summary);
	});
}
function showSavedTrip(id){
  let tripString = localStorage.getItem("trips");
  let trips = JSON.parse(tripString);
  let trip = trips[id];
  let tripHops = trip.ids;

  hops.clearLayers();
  routeLines.clearLayers();
  //set starter marker
  place = all_places[tripHops[0]];
  my_icon = L.icon({iconUrl: `/static/icons/home.png`,iconSize: [24, 24], iconAnchor: [12,24]});
  marker = L.marker([place.place_lat, place.place_lon],{icon:my_icon});
  marker.properties = place;
  marker.properties.hop_count = 1;
  marker.bindTooltip(place.place_name);
  marker.addTo(hops);
  //add the rest
  for(let i=1;i<tripHops.length;i++){
    thisHop = all_places[tripHops[i]];
    lastHop = all_places[tripHops[i-1]];
    pointA = new L.LatLng(parseFloat(lastHop.place_lat), parseFloat(lastHop.place_lon));
    pointB = new L.LatLng(parseFloat(thisHop.place_lat), parseFloat(thisHop.place_lon));
    var pointList = [pointA, pointB];
    new_line = new L.Polyline(pointList, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});
    new_line.addTo(routeLines);
  
    //add to the hops layer
    my_icon = L.icon({iconUrl: `/static/icons/triphop.png`,iconSize: [24, 24], iconAnchor: [12,24]});
    marker = L.marker([parseFloat(thisHop.place_lat), parseFloat(thisHop.place_lon)],{icon:my_icon});
    //add property for its count
    marker.properties = thisHop;
    marker.properties.from_place_id = lastHop.place_id;
    marker.properties.hop_count = i + 1;
    marker.bindTooltip(thisHop.place_name);
    marker.addEventListener('click', _showLiveOnClick);
    marker.addTo(hops);
  }
  getHops(tripHops[tripHops.length-1]);
  buildSummary();
  showHomeTab();
  document.getElementsByClassName("sidepanel-content-wrapper")[0].scrollTop = 0;
}

async function getTrips(leg,element){
  let from_stop_id = leg.origin.id;
  let to_stop_id = leg.destination.id;
  let trip_id = leg.tripId;
  let line_name = leg.line.name;
  let url=`https://${dbServer}/trips/${encodeURIComponent(trip_id)}?lineName=${encodeURIComponent(line_name)}`;
  const response = await fetch(url);
  openRequestCount --;
  if(openRequestCount==0){document.getElementById("spinner").hidden = true;}
  let block = "";
  if(response.status == 200){
    const jsonResponse = await response.json();
    let trip = jsonResponse.trip;   
    trips[encodeURIComponent(trip_id)] = trip;
    trips[encodeURIComponent(trip_id)].rawHops = [];
    trips[encodeURIComponent(trip_id)].rawStopIds = [];
    trips[encodeURIComponent(trip_id)].fabHops = [];

    if("stopovers" in trip){
      let stopovers = trip["stopovers"];
      let rawHops = [];
      let remarks = "";
      if(trip["remarks"]){
        for(let i=0;i<trip["remarks"].length;i++){
          remarks += `<br>${trip["remarks"][i].text}`;
        }
      }
      let tripCard = '';
      let from_stop_id_noted = false;
      let from_stop_id_index;
      let to_stop_id_noted = false;
      let to_stop_id_index;

      let latlngs = [];
      let fabHops = [];
      //need to keep just the stopovers that are part of the journey
      for(let i=0;i<stopovers.length;i++){
        let timestamp = "";
        if(stopovers[i].stop.id==from_stop_id){
            from_stop_id_noted = true;
            from_stop_id_index = i;
            stopovers[i].timestamp = stopovers[i].plannedDeparture;
        } 
        else{
            stopovers[i].timestamp = stopovers[i].plannedArrival;
        }

        if(from_stop_id_noted == true && to_stop_id_noted == false){
            rawHops.push(stopovers[i]);
          }
          if(stopovers[i].stop.id==to_stop_id){
            to_stop_id_noted = true;
            to_stop_id_index = i;
          } 
        }
        //now look for fab hops
        for(let i=0;i<rawHops.length;i++){           
          let badge = "";
          let onclickFunction = `showPlaceOnMap('${rawHops[i].stop.location.latitude}', '${rawHops[i].stop.location.longitude}','${rawHops[i].stop.name}','${rawHops[i].stop.id}')`;
          Object.entries(all_places).forEach((entry) => {
            const [id, place] = entry;
            if(distanceBetweenTwoPoints(rawHops[i].stop.location.latitude,rawHops[i].stop.location.longitude,place.place_lat,place.place_lon) <= place.lat_lon_tolerance){
              onclickFunction = `popupPlace('${place.place_id}')`;
              if (!fabHops.includes(place.place_id)) {
                fabHops.push(place.place_id);
                trips[encodeURIComponent(trip_id)]["fabHops"].push(place);
                my_icon = L.icon({iconUrl: `/static/icons/triphop.png`,iconSize: [24, 24], iconAnchor: [12,24]});
                marker = L.marker([rawHops[i].stop.location.latitude, rawHops[i].stop.location.longitude],{icon:my_icon});
                marker.properties = rawHops[i];
                marker.bindTooltip(rawHops[i].stop.name);
                marker.addEventListener('click', _showFromToOnClick);
                marker.addTo(fromToStops);
              }
              badge = `<span class="badge text-bg-light">Fab Hop!</span>`;
            }
          });
          tripCard += `<li class="list-group-item">${rawHops[i].timestamp.substring(11,19)}: <a href="#" onclick="showPlaceOnMap('${rawHops[i].stop.location.latitude}', '${rawHops[i].stop.location.longitude}','${rawHops[i].stop.name}','${rawHops[i].stop.id}')">${rawHops[i].stop.name} ${badge}</a></li>`
          latlngs.push([rawHops[i].stop.location.latitude, rawHops[i].stop.location.longitude])
        }

        if(from_stop_id_noted){
          if(fabHops.length > 1){badge = `<span class="badge text-bg-light">${fabHops.length} fab hops!</span>`}
          else if (fabHops.length == 1){badge = `<span class="badge text-bg-light">1 fab hop!</span>`}
          else{badge=""}    
          //need to add this when we have reached the stop
          let tripCardheader = `
          <div class="card">
          <div class="card-header livetrip" onclick="showFromToTripOnMap('${encodeURIComponent(trip_id)}')" timestamp="${rawHops[0].timestamp.substring(11,19)}">
          ${rawHops[0].timestamp.substring(11,19)} 
          <a data-bs-toggle="collapse" href="#${encodeURIComponent(trip_id)}" aria-expanded="false" aria-controls="${encodeURIComponent(trip_id)}">
          ${rawHops[0].stop.name} to ${rawHops[rawHops.length-1].stop.name}
          </a> ${badge}
          </div>
          <div class="collapse" id="${encodeURIComponent(trip_id)}">
          <div class="card-body">
          <p>${trip.line.mode}
          <!--${remarks}-->
          </p>
          <ul class="list-group list-group-flush">
          `;
          document.getElementById(element).insertAdjacentHTML('beforeend',`${tripCardheader}${tripCard}</ul></div></div></div>`);
          var polyline = L.polyline(latlngs, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});      
          polyline.addEventListener('click',_fromToRouteLineClicked);
          polyline.properties = trip;
          polyline.addTo(fromToLines);
        }
      }
  } 
  else if(response.status>399){console.log(`issue getting trip ${trip_id}`);}
   
}

function showFromToTripOnMap(tripId){
  let trip = trips[tripId];
  if(trip){
  if("stopovers" in trip){
    let stopovers = trip["stopovers"]
    departureTime = stopovers[0]["plannedDeparture"]
    fromToStops.clearLayers();
      for(let i = trip.from_stop_id_index ;i<trip.to_stop_id_index + 1 ;i++){
        let timestamp = "";
        if(stopovers[i].departure){timestamp = stopovers[i].departure};
        if(!timestamp){ timestamp = stopovers[i].arrival}        
      }
      trip.fabHops.forEach(fabHop=>{
        my_icon = L.icon({iconUrl: `/static/icons/triphop.png`,iconSize: [24, 24], iconAnchor: [12,24]});
        marker = L.marker([fabHop.place_lat, fabHop.place_lon],{icon:my_icon});
        marker.properties = fabHop;
        marker.bindTooltip(fabHop.place_name);
        marker.addEventListener('click', _showFromToOnClick);
        marker.addTo(fromToStops);
      })
      fromToLines.getLayers().forEach(item=>{
        let decoded = decodeURIComponent(tripId);
        if(item.properties.id == decoded){
          item.setStyle({color: '#ff6600ff',weight: 3,opacity: 1})
          item.bringToFront();
        }
        else{
          item.setStyle({color: '#8a8988',weight: 3,opacity: 0.5})

        }
 
      })
    }}
}

function _showFromToOnClick(e){
  showPlaceOnMap(e.latlng.lat, e.latlng.lng,e.sourceTarget.properties.name,e.sourceTarget.properties.id)
}
function _fromToRouteLineClicked(e){
  showFromToTripOnMap(encodeURIComponent(e.sourceTarget.properties.id));
}

function addSharedHops(items){
  let hopsToAdd = JSON.parse(decodeURIComponent(items));
  freestyleStartPoints.clearLayers();
  possibleHops.clearLayers();
  hops.clearLayers();
  routeLines.clearLayers();
  let place = all_places[hopsToAdd[0]]
  var my_icon = L.icon({iconUrl: `/static/icons/home.png`,iconSize: [24, 24], iconAnchor: [12,24]});
  var marker = L.marker([place.place_lat, place.place_lon],{icon:my_icon});
  marker.properties = place;
  marker.properties.hop_count = 1;
  marker.bindTooltip(place.place_name);
  marker.addTo(hops);
  for(let i=1;i<hopsToAdd.length;i++){
    place = all_places[hopsToAdd[i]];
    var last_hop;
    last_hop = all_places[hopsToAdd[i-1]];
    pointA = new L.LatLng(parseFloat(last_hop.place_lat), parseFloat(last_hop.place_lon));
    pointB = new L.LatLng(parseFloat(place.place_lat), parseFloat(place.place_lon));
    var pointList = [pointA, pointB];
    new_line = new L.Polyline(pointList, {color: '#ff6600ff',weight: 3,opacity: 0.5,smoothFactor: 1});
    new_line.addTo(routeLines);
  
    //add to the hops layer
    my_icon = L.icon({iconUrl: `/static/icons/triphop.png`,iconSize: [24, 24], iconAnchor: [12,24]});
    marker = L.marker([parseFloat(place.place_lat), parseFloat(place.place_lon)],{icon:my_icon});
    //add property for its count
    marker.properties = place;
    marker.properties.from_place_id = last_hop.place_id;
    marker.properties.hop_count = i + 1;
    marker.bindTooltip(place.place_name);
    marker.addEventListener('click', _hopOnClick);
    marker.addTo(hops);
  }
  let hops_items = hops.getLayers();
  showHomeTab();
  let freestyleBody = `
  <div class="row justify-content-evenly">
    <div class="col-7">
      <h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">Starting at ${hops_items[0].properties.place_name}</h5></div><div class="col" style="float: right;"><img src="/static/icons/save.png" onclick="checkSavingConsent()" title="save" alt="save">  <img src="/static/icons/delete.png" onclick="startAgain()" title="start again" alt="start again"> <small id="tripMessage"></small>
    </div>
	<div id="settingsSection">
      <input class="form-check-input" type="checkbox" style="background-color:#ff6600ff" id="train" ${modes["train"]} onchange="checkChanged('train')">
      <label class="form-check-label" for="train">train</label>
      <input class="form-check-input" type="checkbox" style="background-color:#ff6600ff" id="bus" ${modes["bus"]} onchange="checkChanged('bus')">
      <label class="form-check-label" for="bus">coach</label>
      <input class="form-check-input" type="checkbox" style="background-color:#ff6600ff" id="ferry" ${modes["ferry"]} onchange="checkChanged('ferry')">
      <label class="form-check-label" for="ferry">ferry</label>
    </div>

    <div id="consentSection" hidden="true">This will save the trip to your device but not be shared with anyone else. Are you happy to proceed? <button class="btn btn-secondary btn-sm" onclick="giveConsent()">OK</button><button onclick="refuseConsent()" class="btn btn-secondary btn-sm">Not OK</button></div>
  </div>`;
  for(let i=1;i< hops_items.length;i++){
    let removalElement = "";
    if(i == hops_items.length - 1){removalElement = `<button class="btn btn-danger btn-sm" onclick="removeHop('${i}')">remove</button>`;}
    freestyleBody +=`
    <div class="card border-light mb-3 ">
    <div class="row g-0">
      <div class="col-md-12">
        <img src="/static/icons/train.png" class="img-fluid rounded-start" alt="train">
        <a href="#" class="link-dark link-offset-2" onclick="openTravelDetails('${hops_items[i -1].properties.place_id}','${hops_items[i].properties.place_id}')">${hops_items[i -1].properties.place_name} to ${hops_items[i].properties.place_name} travel options</a>
       </div>
    </div>
  </div>`;
    freestyleBody +=`
    <div class="card">
     <img src="${hops_items[i].properties.place_image}" class="img-fluid rounded-start" alt="hop image" title = "${hops_items[i].properties.image_attribution}" onclick="popAndZoom('${hops_items[i].properties.place_id}')">
     <div class="card-img-overlay">
     <div class="row justify-content-evenly"><div class="col"><a href="#" style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:white; text-shadow:-1px 1px 0 #000, 1px 1px 0 #000; " onclick="popAndZoom('${hops_items[i].properties.place_id}')">${hops_items[i].properties.place_name}</a></div><div class="col-4">${removalElement}</div></div>
    </div>
    </div>`;
    }
    let nextHopSummary = `<div class="card"><div class="card-header">Where next? <span onclick="chooseNextPlace('${place.place_id}')" class="badge text-bg-secondary">pick next hop</span></div><div class="card-body"></div></div>`;
    freestyleBody += nextHopSummary;
    document.getElementById("freestyleBody").innerHTML = freestyleBody;

}
function chooseNextPlace(place_id){
  getHops(place_id); 
  buildSummary();
}

function share() {
  let hops_items = hops.getLayers();
  let hopIds = [];
  for(let i=0;i< hops_items.length;i++){
    hopIds.push(`"${hops_items[i].properties.place_id}"`);
  }
  let sharableLink = `https://triphop.info/?action=share&hops=[${hopIds.join(",")}]`
  // Copy the text inside the text field
  navigator.clipboard.writeText(sharableLink); 
  alert("trip link copied to clipboard");
}

function chooseRandomPlace(){
  let cands = document.getElementsByClassName("candidates");
  let randomItem = Math.floor(Math.random() * cands.length);;
  for(let i=0;i<randomItem+1;i++){
    let cand = cands[i];
    let delay = 1000;
    if(randomItem>4){delay = Math.floor(5000/randomItem)}
    if(i==randomItem){setTimeout(showRandomPlace,i*delay,cand,true);}
    else{setTimeout(showRandomPlace,i*delay,cand,false);}
  }
}

function showRandomPlace(item,add){
  let myRepPlace = RegExp(".+'([^']+)'.+", 'g');
  let oc = item.attributes['onclick'].value
  let myArray = myRepPlace.exec(oc)
  let place_id = myArray[1];
  let ph = possibleHops.getLayers();
  let place = all_places[place_id];
  for(let i=0;i<ph.length;i++){
    if(ph[i].properties.place_id ==place_id){
      candidateHop = ph[i].properties;
    }
  }
  popup = L.popup().setLatLng([place.place_lat,place.place_lon]).setContent(`<div><img src="/static/icons/hopping_icon.png"><span>${place.place_name}?<span></div>`).openOn(map);
  setPlaceDetails(place_id);
  var block = get_travel_details_block(candidateHop.details);
  document.getElementById("travel_details_body").innerHTML = `<h5 style="font-family: 'Cantora One', Arial; font-weight: 700; vertical-align: baseline; color:#ff6600ff">${hops.getLayers()[hops.getLayers().length -1].properties.place_name} to ${place.place_name}</h5>${block}`;  
  if(add){
    setTimeout(_addToTrip(),2000);
    setTimeout(showSidepanelTab('tab-home'),3000);
  } 
}
