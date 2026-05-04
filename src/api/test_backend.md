# Task Tests: Code Register and Login Page Back End

---

## Test 1 – Verify that the register endpoint creates a new user

1. Access the register page of the website.
2. Enter a unique username and a valid password.
3. Click the register/submit button.
4. Verify that the response returns a success message.
5. Verify that the new user is stored in the database.

---

## Test 2 – Finds bug if register endpoint allows duplicate usernames

1. Access the register page of the website.
2. Enter a username that already exists in the database.
3. Enter any valid password and click the register/submit button.
4. Verify that the response returns an error message indicating the username already exists.
5. Verify that no duplicate entry is added to the database.

---

## Test 3 – Verify that the login endpoint authenticates a valid user

1. Access the login page of the website.
2. Enter a username and password that exist in the database.
3. Click the login/submit button.
4. Verify that the response returns a success message.
5. Verify that a token is returned in the response.

---

## Test 4 – Finds bug if login endpoint accepts invalid credentials

1. Access the login page of the website.
2. Enter a username that exists in the database but with an incorrect password.
3. Click the login/submit button.
4. Verify that the response returns an error message indicating invalid credentials.
5. Verify that no token is returned in the response.

---

## Test 5 – Finds bug if login endpoint accepts a non-existent user

1. Access the login page of the website.
2. Enter a username that does not exist in the database.
3. Enter any password and click the login/submit button.
4. Verify that the response returns an error message indicating invalid credentials.
5. Verify that no token is returned in the response.
