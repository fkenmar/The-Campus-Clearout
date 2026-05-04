<?php
require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    die("Database connection failed.");
}

if (!isset($_GET["token"])) {
    die("Invalid verification link.");
}

$token = $_GET["token"];

// Find the user with this token
$stmt = $conn->prepare("SELECT id, is_verified FROM users WHERE verification_token=?");
$stmt->bind_param("s", $token);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    die("Invalid or expired token.");
}

$user = $result->fetch_assoc();

// Mark as verified if not already
if ($user["is_verified"] == 0) {
    $stmt = $conn->prepare("UPDATE users SET is_verified=1, verification_token=NULL WHERE id=?");
    $stmt->bind_param("i", $user["id"]);
    $stmt->execute();
}

$conn->close();
?>

<!DOCTYPE html>
<html>
<head>
    <title>Email Verified</title>
    <?php
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $appRoot = $protocol . '://' . $_SERVER['HTTP_HOST'] . '/CSE442/2026-Spring/cse-442s/';
    ?>
    <meta http-equiv="refresh" content="4;url=<?php echo htmlspecialchars($appRoot); ?>">
    <style>
        body { font-family: Arial; background:#A9D1C3; text-align:center; padding-top:100px; }
        .card { background:white; display:inline-block; padding:40px; border-radius:12px; box-shadow:0 5px 20px rgba(0,0,0,0.2); }
        h1 { color:#009966; margin-bottom:15px; }
        .button { background:#009966; color:white; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold; }
    </style>
</head>
<body>
<div class="card">
    <h1>Email Verified ✅</h1>
    <p>Your email is now verified.</p>
    <p>Redirecting to login...</p>
    <a class="button" href="<?php echo htmlspecialchars($appRoot); ?>">Go to Login Now</a>
</div>
</body>
</html>