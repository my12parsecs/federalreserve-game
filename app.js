const start = document.querySelector(".start-button")
const startContainer = document.querySelector(".start-button-container")

const interestSubmit = document.querySelector(".interest-submit")
const interestOption = document.querySelector(".interest-option")

const day = document.querySelector(".current-day-data")
const interest = document.querySelector(".current-interest-data")

const currentUrl = window.location.href
const link = document.querySelector(".share-link")


url ="https://twitter.com/intent/tweet?url=" + currentUrl + "&text=Federal Reserve Game - Can you control the economy?"
link.href = url

start.addEventListener("click", ()=>{

    startContainer.innerHTML = "<p class='start-message'>You are now officially Jerome Powell.</p>"

    let count = 1;
  
    function updateCounter() {
      day.textContent = count;
      count++;
    }
  
    updateCounter(); // 初期表示
  
    const intervalId = setInterval(updateCounter, 1000); // 1秒ごとにupdateCounterを呼び出す
})

interestSubmit.addEventListener("click", ()=>{
    let selectedValue = interestOption.options[interestOption.selectedIndex].text
    interest.innerHTML = selectedValue
})




