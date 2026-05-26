function login() {

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;

    if (email === "admin@gmail.com" && password === "12345") {

        alert("Login Successful");

        window.location.href = "dashboard.html";

    } else {
        alert("Invalid Email or Password");
    }

}