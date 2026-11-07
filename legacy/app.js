const start = document.querySelector(".start-button")
const startContainer = document.querySelector(".start-button-container")

const interestSubmit = document.querySelector(".interest-submit")
const interestOption = document.querySelector(".interest-option")

const day = document.querySelector(".current-day-data")
const interest = document.querySelector(".current-interest-data")
const inflation = document.querySelector(".current-inflation-data")

const currentUrl = window.location.href
const link = document.querySelector(".share-link")


url ="https://twitter.com/intent/tweet?url=" + currentUrl + "&text=Federal Reserve Game - Can you control the economy?"
link.href = url



let interestState = interestOption.value
let inflationState = inflation.textContent.replace(/%/g, '')

let inflationInterval





function inflationUpdate(interestState){
    let rate = inflation.textContent.replace(/%/g, '')
    console.log("この次がrate　取り出したやつ");
    console.log(rate);
    function updateRate() {
      inflation.textContent = rate + "%";
      rate = rate + 0.25 - interestState;
      console.log(rate = rate + 0.25 - interestState);
      console.log("florence");
      console.log(rate);
      // inflationState = rate
      // console.log(inflationState);
    }
    updateRate(); // 初期表示 
    console.log("venice");
    inflationInterval = setInterval(updateRate, 1000);
    console.log("milan");
}






start.addEventListener("click", ()=>{
    startContainer.innerHTML = "<p class='start-message'>You are now officially Jerome Powell.</p>"
    let count = 1;  
    function updateCounter() {
      day.textContent = count;
      count++;
    }
    updateCounter(); // 初期表示 
    const weekInterval = setInterval(updateCounter, 1000); // 1秒ごとにupdateCounterを呼び出す
    return inflationUpdate(interestState)
})




interestSubmit.addEventListener("click", ()=>{
    interestState = interestOption.options[interestOption.selectedIndex].text
    interest.innerHTML = interestState
    clearInterval(inflationInterval)
    console.log("この次がinterest");
    console.log(interestState);
    console.log("この次がinflationState");
    console.log(inflationState);
    inflationUpdate(interestState)
})










