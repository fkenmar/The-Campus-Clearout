<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["message" => "Database connection failed"]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$email = trim($data["email"] ?? "");
$password = trim($data["password"] ?? "");

if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(["message" => "Email and password are required"]);
    exit;
}

$stmt = $conn->prepare("SELECT id, username, password, is_verified FROM users WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid email or password"]);
    exit;
}

$row = $result->fetch_assoc();
$stmt->close();

if (!password_verify($password, $row["password"])) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid email or password"]);
    exit;
}

$user_id = (int)$row["id"];
$username = $row["username"];

if ((int)$row["is_verified"] !== 1) {
    http_response_code(403);
    echo json_encode([
        "message" => "This account is not verified, please verify your account to login"
    ]);
    exit;
}

// Ban accounts with usernames exceeding the 50-char limit (legacy accounts created before validation)
if (strlen($username) > 50) {
    $delSesStmt = $conn->prepare("DELETE FROM user_sessions WHERE username = ?");
    $delSesStmt->bind_param("s", $username);
    $delSesStmt->execute();
    $delSesStmt->close();

    $delUsrStmt = $conn->prepare("DELETE FROM users WHERE username = ?");
    $delUsrStmt->bind_param("s", $username);
    $delUsrStmt->execute();
    $delUsrStmt->close();
    $conn->close();
    http_response_code(403);
    echo json_encode([
        "message" => "Your account has been removed because your username exceeds the 50-character limit. Please sign up again with a shorter username.",
        "banned" => true
    ]);
    exit;
}

// Ensure sessions table exists with expires_at column
$conn->query("CREATE TABLE IF NOT EXISTS user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT NULL
)");
$conn->query("ALTER TABLE user_sessions ADD COLUMN expires_at DATETIME DEFAULT NULL");

// Clean up expired tokens
$conn->query("DELETE FROM user_sessions WHERE expires_at IS NOT NULL AND expires_at <= NOW()");

// Reuse existing valid token if one exists
$checkStmt = $conn->prepare("SELECT token, expires_at FROM user_sessions WHERE username = ? AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1");
$checkStmt->bind_param("s", $username);
$checkStmt->execute();
$checkResult = $checkStmt->get_result();

if ($checkResult->num_rows > 0) {
    $row = $checkResult->fetch_assoc();
    $checkStmt->close();

    // If the existing token has no expiry (old session), fix it to 24 hours from now
    if ($row["expires_at"] === null) {
        $newExpires = date('Y-m-d H:i:s', strtotime('+24 hours'));
        $fixStmt = $conn->prepare("UPDATE user_sessions SET expires_at = ? WHERE token = ?");
        $fixStmt->bind_param("ss", $newExpires, $row["token"]);
        $fixStmt->execute();
        $fixStmt->close();
        $row["expires_at"] = $newExpires;
    }

    echo json_encode([
        "message"    => "Login successful",
        "token"      => $row["token"],
        "expires_at" => strtotime($row["expires_at"]) * 1000,
        "username"   => $username,
        "user_id"    => $user_id
    ]);
    $conn->close();
    exit;
}
$checkStmt->close();

// Create new token with 24-hour expiry
$token = bin2hex(random_bytes(16));
$expires = date('Y-m-d H:i:s', strtotime('+24 hours'));

$insertStmt = $conn->prepare("INSERT INTO user_sessions (username, token, expires_at) VALUES (?, ?, ?)");
$insertStmt->bind_param("sss", $username, $token, $expires);
$insertStmt->execute();
$insertStmt->close();

echo json_encode([
    "message"    => "Login successful",
    "token"      => $token,
    "expires_at" => strtotime($expires) * 1000,
    "username"   => $username,
    "user_id"    => $user_id
]);

$conn->close();
?>
