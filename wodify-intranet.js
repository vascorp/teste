var links = document.getElementsByTagName('a');

for(var i = 0; i< links.length; i++){
  if(links[i].href.includes("/sub-nav")) links[i].setAttribute('href', "#");
  if(links[i].href.includes("#")) links[i].setAttribute('data-url', "#");
}