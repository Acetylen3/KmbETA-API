$(document).ready(function(){
	if (!window.location.protocol.startsWith("https:") && !window.location.protocol.startsWith("file:")){
		window.location = "https://www.kmbeta.ml/app/";
	}
});

var locAccessCheckTimerId;
var currLocUptTimerId;
var currLocMarker;
var map;
var kmbDb;
var currPos;

var selectedRoute;
var selectedBound;
var selectedStop;

var routePathsMarkers = [];
//var routeLines = [];
var routeMarkers = [];

function initMap(){
	map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: 22.25, lng: 114.1667},
        zoom: 12
    });

	//$("#waitMapModal").modal('hide');
	$("#waitMapModal").modal({backdrop: 'static', keyboard: false});
	locAccessCheckTimerId = setInterval(function(){checkLocAccessPerm()}, 1000);
	
	if (navigator.geolocation){
		navigator.geolocation.getCurrentPosition(function(position){
		    $("#waitMapModal").modal('hide');
			
			var pos = {
			  lat: position.coords.latitude,
			  lng: position.coords.longitude
			}
			currPos = pos;
			
			currLocMarker = new google.maps.Marker({
				position: pos,
				map: map,
				icon: "human.png"
			});
			
			map.setCenter(pos);
			map.setZoom(16);
			
			map.addListener('center_changed', function(){
				removeAllListRoutes();
				recenterMarkers();
			});
			
			currLocUptTimerId = setInterval(function(){uptCurrLocMarker()}, 1000);
			
			kmbEtaLoadDb();
		}, function(){
		    $("#waitMapModal").modal('hide');
	        $("#noMapModal").modal({backdrop: 'static', keyboard: false});
		});
	} else {
	    $("#noMapModal").modal({backdrop: 'static', keyboard: false});
	}
}

function kmbEtaLoadDb(){
    kmbDb = new Database();
	$("#loadDbPb").attr("aria-valuenow", "0");
	$("#loadDbPb").attr("style", "width: 0%");
	$("#loadDbPbText").html("0% Complete");
	$("#loadDbModal").modal({backdrop: 'static', keyboard: false});
	Database.prototype.loadProgressHandler = function(p){
		p = (p * 100).toFixed(2);
	    $("#loadDbPb").attr("aria-valuenow", p);
	    $("#loadDbPb").attr("style", "width: " + p + "%");
	    $(".loadDbPbText").html(p + "% Complete");
	};
	var ajax = kmbDb.loadWebDb();
	ajax.done(function(){
	    $("#loadDbModal").modal('hide');
		recenterMarkers();
	});
}

function recenterMarkers(){
	if (selectedRoute != null && selectedStop != null){
		selectRoute(selectedRoute, selectedBound, selectedStop);
		return;
	}
	var lat = map.getCenter().lat();
	var lng = map.getCenter().lng();
	listAllStopsInRange({lat: lat, lng: lng}, 2);	
}

function selectRoute(route, bound, stopcode){
	selectedRoute = route;
	selectedStop = stopcode;
	selectedBound = bound;
    removeAllListRoutes();
	
	var i = findRouteIndex(route);
	
	if (i == -1){
		return;
	}
	
    buildRouteLinesAndMarkers(i, selectedBound);	
}

function deselectRoute(){
    removeAllListRoutes();
	selectedRoute = null;
	selectedStop = null;
	recenterMarkers();
}

function removeAllListRoutes(){
    for (var i = 0; i < routePathsMarkers.length; i++){
        routePathsMarkers[i].path.setMap(null);
		for (var x = 0; x < routePathsMarkers[i].markers.length; x++){
		    routePathsMarkers[i].markers[x].setMap(null);
		}
    }
	routePathsMarkers = [];
	
    for (var i = 0; i < routeMarkers.length; i++){
        routeMarkers[i].setMap(null);
    }
	routeMarkers = [];
}

function listAllRoutesInRange(pos, range){
	console.log(pos);
	var rr = findRoutesInRange(pos, range);
	
	for (var i = 0; i < rr.length; i++){
	    var index = findRouteIndex(rr[i].name);
        if (index != -1){
			console.log("Listing " + rr[i].name);
			buildRouteLinesAndMarkers(index, 0);
        } else {
            console.log("Error: Could not find route index for " + rr[i].name);    
			alert("Error: Could not find route index for " + rr[i].name + "\nPlease report to GitHub issue tracker!");   
		}		
	}
	console.log("Listed all");
}

function getRoutesByStop(stopcode){
	var db = kmbDb.db.buses;
	
	var o = [];
	for (var i = 0; i < db.length; i++){
		var bounds = db[i].bounds;
	    for (var x = 0; x < bounds.length; x++){
		    var stops = bounds[x].stops;
            for (var y = 0; y < stops.length; y++){
                if (stops[y].stopcode === stopcode){
					db[i].bound = x;
				    o.push(db[i]);	
				}
            }			
		}
	}
	return o;
}

function listAllStopsInRange(pos, range){
	var sr = findStopsInRange(pos, range);
	
	for (var i = 0; i < sr.length; i++){
		var lat = parseFloat(sr[i].lat);
		var lng = parseFloat(sr[i].lng);
		var coord = {
			lat, lng
		};
		var m = new google.maps.Marker({
			position: coord,
			map: map
		});
		
		m.addListener('click', function(){
			var d = getStopInfo(this.getPosition().lat(), this.getPosition().lng());
	        var iw = new google.maps.InfoWindow({
		        content: d
	        });
	        iw.open(map, this);
		});
		routeMarkers.push(m);
	}
}

function getStopInfo(lat, lng){
	var stop = getStopByLatLng(lat, lng);
	var cs = "<div id=\"content\"><h3>" + stop.stopname_eng + "</h3><p>Stop-Code: " + stop.stopcode + "</p><p>Buses: ";
	
	var ss = getRoutesByStop(stop.stopcode);
	
	for (var x = 0; x < ss.length; x++){
	    cs += "<a href=\"javascript:selectRoute('" + ss[x].name + "', " + stop.bound + ", '" + stop.stopcode + "')\">" + ss[x].name + "</a>";
        if (x != ss.length - 1){
			cs += ", ";
        }			
	}
	
	cs += "</p></div>";
	
	return cs;
}

function getRouteStopEtaInfo(lat, lng){
	var stop = getStopByLatLng(lat, lng);
	var gid = "route_" + selectedRoute + "_" + stop.bound + "_" + stop.stopcode + "_eta";
	
	var cs = "<div id=\"content\"><h3>" + stop.stopname_eng + "</h3><p>Route: " + selectedRoute + "</p><p>ETA: <span id=\"" + gid + "\">Getting ETA data...</span></p><p><a href=\"javascript:deselectRoute()\">Deselect Route</a></p></div>";
	
	console.log(stop.bound);
	var am = new ArrivalManager(selectedRoute, stop.bound , stop.stopcode, 0, stop.stopseq);
	
	am.getEtaData().done(function(){
		console.log(am.etaData);
		//var at = new ArrivalTime(am.etaData, 0);
		//$("#" + gid).html(at.getHr() + ":" + at.getMin());
		$("#" + gid).html(JSON.stringify(am.etaData));
	});
	
	return cs;
}

function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function buildRouteLinesAndMarkers(routeIndex, boundIndex){
	var coord = [];
	
	console.log("RI: " + routeIndex + " BI: " + boundIndex);
	console.log(kmbDb.db.buses[routeIndex]);
	console.log(kmbDb.db.buses[routeIndex].bounds[boundIndex]);
	var routeStops = kmbDb.db.buses[routeIndex].bounds[boundIndex].stops;
	
	//Build COORDS
	for (var i = 0; i < routeStops.length; i++){
	    coord.push({
		    lat: parseFloat(routeStops[i].lat),
            lng: parseFloat(routeStops[i].lng)			
		});	
	}
	
	//Render polyline
	var color = getRandomColor();
	var path = new google.maps.Polyline({
		path: coord,
		geodesic: true,
		strokeColor: color,
		strokeOpacity: 1,
		strokeWeight: 8
	});
	path.setMap(map);
	
	var markers = [];
	
	//Render markers
	for (var i = 0; i < coord.length; i++){
		var label = kmbDb.db.buses[routeIndex].name + ": " + (i + 1);
		var m = new google.maps.Marker({
			position: coord[i],
			map: map,
			label: label
		});
		m.addListener('click', function(){
			var d = getRouteStopEtaInfo(this.getPosition().lat(), this.getPosition().lng());
	        var iw = new google.maps.InfoWindow({
		        content: d
	        });
	        iw.open(map, this);
		});
		markers.push(m);
	}

	path.setMap(map);
	routePathsMarkers.push({
		path: path,
		markers: markers
	});
}

function findRouteIndex(routeName){
    for (var i = 0; i < kmbDb.db.buses.length; i++){
	    if (kmbDb.db.buses[i].name === routeName){
            return i;
		}		
	}
    return -1;	
}

function findRoutesInRange(pos, range){
    var sr = findStopsInRange(pos, range);
	
    var i;
	var x;
	var y;
    var o = [];
	
	var db = kmbDb.db.buses;
	for (i = 0; i < db.length; i++){
		var bounds = db[i].bounds;
		for (x = 0; x < bounds.length; x++){
		    var stops = bounds[x].stops;
            for (y = 0; y < stops.length; y++){
				if (isStopCodeInArray(sr, stops[y].stopcode) &&
				    !isRouteNameInArray(o, db[i].name)){
					o.push(db[i]);
				}
            }			
		}
    }
	
    return o;	
}

function findStopsInRange(pos, range){
    var db = kmbDb.db.buses;
    var i;
	var x;
	var y;
	var o = [];
    for (i = 0; i < db.length; i++){
		var bounds = db[i].bounds;
		for (x = 0; x < bounds.length; x++){
		    var stops = bounds[x].stops;
            for (y = 0; y < stops.length; y++){
                var d = distance(pos.lat, pos.lng, stops[y].lat, stops[y].lng);
				if (d <= range && !isStopCodeInArray(o, stops[y].stopcode)){
					o.push(stops[y]);
				}
            }			
		}
    }
	return o;
}

function getStopByLatLng(lat, lng){
	console.log("Lat:");
	console.log(lat);
	console.log("Long:");
	console.log(lng);
    var db = kmbDb.db.buses;
    var i;
	var x;
	var y;
	var o = [];
    for (i = 0; i < db.length; i++){
		var bounds = db[i].bounds;
		for (x = 0; x < bounds.length; x++){
		    var stops = bounds[x].stops;
            for (y = 0; y < stops.length; y++){
                if (isDiffNotBigger(stops[y].lat, lat, 0.00001) &&
				isDiffNotBigger(stops[y].lng, lng, 0.00001)){
					stops[y].bound = x;
					console.log("Found");
				    return stops[y];	
				}
            }			
		}
    }
	console.log("Not found");
	return null;
}

function isDiffNotBigger(val0, val1, big){
    if (val0 > val1){
	    return (val0 - val1) < big;	
	} else {
		return (val1 - val0) < big;
	}
}

function isRouteNameInArray(array, name){
	for (var i = 0; i < array.length; i++){
	    if (name === array[i].name){
            return true;
        }		
	}
	return false;
}

function isStopCodeInArray(array, stopcode){
	for (var i = 0; i < array.length; i++){
	    if (stopcode === array[i].stopcode){
            return true;
        }		
	}
	return false;
}

function distance(lat1, lon1, lat2, lon2) {
  var p = 0.017453292519943295;    // Math.PI / 180
  var c = Math.cos;
  var a = 0.5 - c((lat2 - lat1) * p)/2 + 
          c(lat1 * p) * c(lat2 * p) * 
          (1 - c((lon2 - lon1) * p))/2;

  return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
}

function checkLocAccessPerm(){
    navigator.geolocation.getCurrentPosition(function(position){
		$("#waitMapModal").modal('hide');
		clearInterval(locAccessCheckTimerId);
	}, function(){});
}

function uptCurrLocMarker(){
	navigator.geolocation.getCurrentPosition(function(position){
		var pos = {
		  lat: position.coords.latitude,
		  lng: position.coords.longitude
		}
		pos = {lat: 22.3305779, lng: 114.2064588}
		currPos = pos;
		currLocMarker.setPosition(pos);
	}, function(){
		clearInterval(currLocUptTimerId);
		$("#waitMapModal").modal('hide');
	    $("#noMapModal").modal({backdrop: 'static', keyboard: false});
	});
}