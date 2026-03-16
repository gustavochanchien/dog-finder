/* ═══ Fetch from 24PetConnect via proxy ═══ */
async function fetchDirect(lat,lon,miles,index){
  index=index||0;
  var p=new URLSearchParams();
  p.append("model[AnimalType]","");
  p.append("model[SearchType]","ADOPT");
  p.append("model[Latitude]",lat);
  p.append("model[Longitude]",lon);
  p.append("model[Miles]",miles);
  if(index>0)p.append("model[Index]",index);
  p.append("model[LocationChanged]","false");
  p.append("model[URLName]","");
  p.append("model[AnimalFilter][AnimalType]","");
  p.append("model[AnimalFilter][SearchType]","ADOPT");
  p.append("model[AnimalFilter][URLName]","");
  p.append("model[AnimalFilter][ShelterList]","");
  p.append("model[AnimalFilter][BreedList]","");
  p.append("model[AnimalFilter][SimilarBreeds]","false");
  p.append("model[AnimalFilter][Gender]","");
  p.append("model[AnimalFilter][Age]","");
  p.append("model[AnimalFilter][Size]","");
  p.append("model[AnimalFilter][SortBy]","");
  p.append("BreedReqId","");
  var body=p.toString();
  var r=await fetch("/api/petconnect/PetHarbor/getAdoptableAnimalsByLatLon",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"},body:body});
  if(!r.ok)throw new Error("HTTP "+r.status);
  var text=await r.text();
  var tm=text.match(/globalAnimalCount\s*=\s*(\d+)/);
  var total=tm?parseInt(tm[1],10):null;
  if(index===0)console.log("[fetchDirect] miles="+miles+" total="+total);
  return{dogs:parsePetResponse(text),total:total};
}

async function fetchAllDirect(lat,lon,miles){
  var API_PAGE=30,BATCH=5;
  var first=await fetchDirect(lat,lon,miles,0);
  if(!first.dogs.length)return first.dogs;
  var all=first.dogs.slice();
  var total=first.total;
  if(!total||total<=API_PAGE)return all;
  var numPages=Math.ceil(total/API_PAGE);
  var indices=[];
  for(var i=1;i<numPages;i++)indices.push(i*API_PAGE);
  for(var i=0;i<indices.length;i+=BATCH){
    var batch=indices.slice(i,i+BATCH);
    var results=await Promise.all(batch.map(function(idx){return fetchDirect(lat,lon,miles,idx)}));
    results.forEach(function(r){all.push.apply(all,r.dogs)});
  }
  return all;
}

function parsePetResponse(text){
  try{
    var j=JSON.parse(text);
    // JSON object with HTML inside
    if(typeof j==="object"&&!Array.isArray(j)){
      for(var k in j){
        if(typeof j[k]==="string"&&j[k].length>100){
          console.log("Found HTML in JSON key:",k,"length:",j[k].length);
          var dogs=parseHTML(j[k]);
          if(dogs.length)return dogs;
        }
      }
      // Try as direct JSON animal list
      if(j.AnimalList||j.Animals)return parseAnimalList(j.AnimalList||j.Animals);
      if(Array.isArray(j))return parseAnimalList(j);
    }
    if(typeof j==="string")return parseHTML(j);
    if(Array.isArray(j))return parseAnimalList(j);
    return[];
  }catch(e){
    // Raw HTML
    return parseHTML(text);
  }
}

function parseAnimalList(list){
  if(!Array.isArray(list))return[];
  return list.reduce(function(acc,a){
    var type=a.AnimalType||a.Type||a.Species||"DOG";
    if(type&&type.toUpperCase()!=="DOG")return acc;
    acc.push({
      id:a.AnimalId||a.Id||a.AnimalID||a.id||"",
      name:cln(a.AnimalName||a.Name||a.name||"Unknown"),
      breed:a.Breed||a.PrimaryBreed||a.breed||null,
      age:a.Age||a.age||null,
      gender:a.Gender||a.Sex||a.gender||null,
      weight:a.Weight||a.weight||null,
      location:a.ShelterName||a.Location||a.ClientName||a.Shelter||a.location||null,
      description:a.Description||a.Memo||a.Notes||a.description||null,
      shelterDate:a.IntakeDate||a.DateAdmitted||a.DateIn||a.shelterDate||null,
      type:type,
      photoUrl:a.PhotoUrl||a.ImageUrl||a.Photo||a.MainPhoto||a.ThumbnailUrl||null
    });
    return acc;
  },[]);
}

function parseHTML(html){
  var dogs=[],seen={};
  var div=document.createElement("div");div.innerHTML=html;

  // Strategy 1: 24PetConnect gridResult format
  var gridCards=div.querySelectorAll(".gridResult[id^='Result_']");
  gridCards.forEach(function(card){
    var id=card.id.replace("Result_","");
    if(!id||seen[id])return;
    var data={};
    card.querySelectorAll("span").forEach(function(span){
      var t=(span.textContent||"").trim(),m;
      if(m=t.match(/^Name\s*:\s*(.+?)\s*\(/i))data.name=m[1].trim();
      else if(m=t.match(/^Gender\s*:\s*(.+)/i))data.gender=m[1].trim();
      else if(m=t.match(/^Breed\s*:\s*(.+)/i))data.breed=m[1].trim();
      else if(m=t.match(/^Age\s*:\s*(.+)/i))data.age=m[1].trim();
      else if(m=t.match(/^Animal type\s*:\s*(.+)/i))data.type=m[1].trim();
      else if(m=t.match(/^Brought to the shelter\s*:\s*(.+)/i))data.shelterDate=m[1].trim();
      else if(m=t.match(/^Located at\s*:\s*(.+)/i))data.location=m[1].trim();
    });
    if(data.type&&data.type.toLowerCase()!=="dog")return;
    var img=card.querySelector("img");
    var photoUrl=img?(img.getAttribute("src")||img.getAttribute("data-src")):null;
    var dlink=card.querySelector("a[href*='Details'],a[href*='Detail'],a[href*='details']");
    var detailUrl=dlink?dlink.getAttribute("href"):null;
    seen[id]=true;
    dogs.push({id:id,name:cln(data.name||id),breed:data.breed||null,age:data.age||null,gender:data.gender||null,weight:null,location:data.location||null,description:null,shelterDate:data.shelterDate||null,photoUrl:photoUrl,detailUrl:detailUrl});
  });

  // Strategy 2: generic card/result elements with animal IDs
  if(!dogs.length){
    var cards=div.querySelectorAll("[data-animalid],[onclick*='Animal'],[class*='nimal'],[class*='result'],[class*='card']");
    cards.forEach(function(c){tryExtractCard(c,dogs,seen)});
  }

  // Strategy 3: links to animal detail pages
  if(!dogs.length){
    div.querySelectorAll("a[href*='Detail'],a[href*='detail'],a[href*='Animal']").forEach(function(a){
      var href=a.getAttribute("href")||"";
      var idM=href.match(/\/(A\d{6,})/)||href.match(/[?&](?:id|an)=(A\d{6,})/i);
      if(idM&&!seen[idM[1]]){
        seen[idM[1]]=true;
        var parent=a.closest("div,tr,li,article")||a;
        var dog=extractDogFromEl(parent,idM[1]);
        dog.detailUrl=href;
        dogs.push(dog);
      }
    });
  }

  // Strategy 4: raw regex for animal IDs
  if(!dogs.length){
    var allIds=html.match(/\bA\d{6,}\b/g)||[];
    var uniq={};allIds.forEach(function(id){
      if(!uniq[id]){uniq[id]=true;dogs.push({id:id,name:id,breed:null,age:null,gender:null,weight:null,location:null,description:null,shelterDate:null,photoUrl:null})}
    });
  }

  return dogs;
}

function tryExtractCard(el,dogs,seen){
  var t=el.textContent||"";
  var idAttr=el.getAttribute&&el.getAttribute("data-animalid");
  var idM=idAttr||(t.match(/\b(A\d{6,})\b/)||[])[1];
  if(!idM)return;if(seen[idM])return;seen[idM]=true;
  dogs.push(extractDogFromEl(el,idM));
}

function extractDogFromEl(el,id){
  var t=(el.textContent||"").replace(/\s+/g," ");
  var img=el.querySelector("img");
  if(!img){var p=el.parentElement;if(p)img=p.querySelector("img")}
  return{
    id:id,
    name:ef(t,/(?:Name)[:\s]*([A-Za-z][\w\s\-']{1,30}?)(?:\s*[\(·\n]|$)/i)||cln(id),
    breed:ef(t,/(?:Breed)[:\s]*([^\n·(]{2,40})/i),
    age:ef(t,/(?:Age)[:\s]*([^\n·(]{2,30})/i),
    gender:ef(t,/\b(Male|Female)\b/i),
    weight:ef(t,/(?:Weight)[:\s]*([^\n·(]{2,20})/i),
    location:ef(t,/(?:Location|Shelter|Client)[:\s]*([^\n·(]{2,60})/i),
    description:null,
    shelterDate:ef(t,/(?:Since|Date|Intake|Brought|Admitted)[:\s]*([\d.\-\/]+)/i),
    photoUrl:img?(img.getAttribute("src")||img.getAttribute("data-src")):null
  };
}

function ef(t,re){var m=t.match(re);return m?m[1].trim():null}
function cln(n){return(n||"").replace(/^\*|\*$/g,"").replace(/\s+/g," ").trim()}
function getPhoto(p){if(!p.photoUrl)return"https://24petconnect.com/AgencyImage/0/0/"+p.id+"/0/0";if(p.photoUrl.startsWith("http"))return p.photoUrl;return"https://24petconnect.com"+p.photoUrl}
function getUrl(p){
  if(p.detailUrl)return p.detailUrl.startsWith("http")?p.detailUrl:"https://24petconnect.com"+p.detailUrl;
  var loc=(p.location||"").toLowerCase();
  if(loc.indexOf("westside")>-1)return"https://24petconnect.com/ABQWestside/Details/ALBQ1/"+p.id;
  if(loc.indexOf("eastside")>-1)return"https://24petconnect.com/ABQEastside/Details/ALBQ/"+p.id;
  return"https://24petconnect.com/SearchResult?an="+p.id;
}
function getShelterId(loc){return(loc||"").toLowerCase().indexOf("westside")>-1?"ALBQ1":"ALBQ"}

/* ═══ Fetch animal detail from 24PetConnect via proxy ═══ */
async function fetchAnimalDetails(animalId,shelterId){
  var body=new URLSearchParams({"model[AnimalId]":animalId,"model[ShelterId]":shelterId}).toString();
  var r=await fetch("/api/petconnect/PetHarbor/getAnimalDetails",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"},body:body});
  if(!r.ok)throw new Error("HTTP "+r.status);
  return parseAnimalDetails(await r.text());
}

function parseAnimalDetails(html){
  var div=document.createElement("div");div.innerHTML=html;
  function gt(cls){var el=div.querySelector(".text_"+cls);return el?(el.innerHTML||el.textContent||"").trim():null}
  var rawAge=gt("Age"),rawWt=gt("Weight"),rawDesc=gt("Description"),rawMore=gt("MoreInfo"),rawLoc=gt("LocatedAt");
  var age=rawAge?rawAge.replace(/^The shelter thinks I am about\s*/i,"").replace(/\s*\.\s*$/,""):null;
  var weight=rawWt?rawWt.replace(/^I weigh approximately\s*/i,"").replace(/\.00\s*lbs/i," lbs").replace(/\s*\.\s*$/,"").trim():null;
  // moreInfo contains the rich bio; strip leading shelter description line
  var bio=rawMore||rawDesc;
  if(bio)bio=bio.replace(/^Shelter staff[^<\n]*[\.<br>]*/i,"").replace(/^<br\s*\/?>\s*/gi,"").trim();
  // Convert <br> to newlines for display
  if(bio){bio=bio.replace(/<br\s*\/?>/gi,"\n");div.innerHTML=bio;bio=div.textContent.trim()}
  var img=div.querySelector("#FullImage"),photoSrc=img&&img.getAttribute("src");
  var photoUrl=photoSrc?(photoSrc.startsWith("http")?photoSrc:"https://24petconnect.com"+photoSrc):null;
  return{age:age,weight:weight,description:bio||null,location:rawLoc||null,photoUrl:photoUrl};
}

/* ═══ Sample Dogs ═══ */
var SAMPLE=[
  {id:"A1933510",name:"Madrid",breed:"Pit Bull Terrier mix",age:"2 years",gender:"Male",weight:"55 lbs",location:"ABQ Animal Welfare - Westside",description:"Madrid runs on fun, toys, and treats! A playful and energetic boy looking for his forever home.",shelterDate:"2026-02-15"},
  {id:"A1918501",name:"Storm",breed:"Labrador Retriever mix",age:"1 year, 7 months",gender:"Female",weight:"39.50 lbs",location:"ABQ Animal Welfare - Westside",description:"Bright, bouncy young pup. Housebroken, crate trained, loves car rides, friendly with everyone.",shelterDate:"2025-10-27"},
  {id:"A1930000",name:"Luna",breed:"German Shepherd Dog mix",age:"3 years",gender:"Female",weight:"62 lbs",location:"ABQ Animal Welfare - Eastside",description:"Loyal and intelligent, bonds deeply with her people. Walks well on leash, knows commands.",shelterDate:"2026-01-20"},
  {id:"A1931234",name:"Copper",breed:"Chihuahua",age:"5 years",gender:"Male",weight:"12 lbs",location:"ABQ Animal Welfare - Eastside",description:"Big personality, small package! Loves lap time and belly rubs.",shelterDate:"2026-02-01"},
  {id:"A1932567",name:"Rosie",breed:"Australian Cattle Dog mix",age:"1 year, 2 months",gender:"Female",weight:"38 lbs",location:"ABQ Animal Welfare - Westside",description:"Active girl who loves fetch and hikes. Best with an experienced owner.",shelterDate:"2026-02-28"},
  {id:"A1929876",name:"Bear",breed:"Rottweiler mix",age:"4 years",gender:"Male",weight:"85 lbs",location:"ABQ Animal Welfare - Eastside",description:"Gentle giant who loves being by your side. Calm indoors, enjoys moderate walks.",shelterDate:"2025-12-10"},
  {id:"A1933890",name:"Daisy",breed:"Beagle mix",age:"6 months",gender:"Female",weight:"18 lbs",location:"ABQ Animal Welfare - Westside",description:"Curious puppy! Great with other dogs, working on house training.",shelterDate:"2026-03-05"},
  {id:"A1928111",name:"Rex",breed:"American Pit Bull Terrier",age:"5 years",gender:"Male",weight:"65 lbs",location:"ABQ Animal Welfare - Eastside",description:"Sweet and loyal, waiting for his forever family. Housebroken, knows sit and shake.",shelterDate:"2025-11-08"},
  {id:"A1934222",name:"Penny",breed:"Dachshund mix",age:"2 years",gender:"Female",weight:"14 lbs",location:"ABQ Animal Welfare - Westside",description:"Little love bug! Great in a crate, enjoys couch snuggles. Good with kids 10+.",shelterDate:"2026-03-10"},
  {id:"A1931555",name:"Duke",breed:"Boxer mix",age:"3 years, 6 months",gender:"Male",weight:"58 lbs",location:"ABQ Animal Welfare - Eastside",description:"Goofy fun-loving boy. Good with other dogs and loves to play.",shelterDate:"2026-01-15"},
  {id:"A1935000",name:"Willow",breed:"Siberian Husky",age:"2 years",gender:"Female",weight:"45 lbs",location:"ABQ Animal Welfare - Westside",description:"Beautiful husky with striking blue eyes. Needs an active family and a secure yard!",shelterDate:"2026-03-01"},
  {id:"A1929333",name:"Biscuit",breed:"Labrador Retriever",age:"8 years",gender:"Male",weight:"72 lbs",location:"ABQ Animal Welfare - Eastside",description:"Senior gentleman with so much love. Calm, housebroken, great with everyone.",shelterDate:"2025-12-22"},
];
