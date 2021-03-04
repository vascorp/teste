function fixMenu (){
    var links = document.getElementsByTagName('a');
    console.log(links);
    console.log(window.top.document.getElementsByTagName('a'));
    for(var i = 0; i< links.length; i++){
        console.log('links[i].href.', links[i].href);
        if(links[i].href.includes("/sub-nav")) links[i].setAttribute('href', "#");
        if(links[i].href.includes("#")) links[i].setAttribute('data-url', "#");
    }
}
fixMenu();