<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Handle preflight requests for CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["message" => "Database connection failed"]);
    exit;
}

// ==========================================
// 1. AUTHENTICATE THE USER VIA TOKEN
// ==========================================
$headers = getallheaders();
$auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$token = str_replace('Bearer ', '', $auth);

if (!$token) {
    http_response_code(401);
    echo json_encode(["message" => "Unauthorized"]);
    exit;
}

$tokenStmt = $conn->prepare("SELECT username FROM user_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())");
$tokenStmt->bind_param("s", $token);
$tokenStmt->execute();
$tokenResult = $tokenStmt->get_result();

if ($tokenResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(["message" => "Invalid or expired token"]);
    exit;
}

$current_username = $tokenResult->fetch_assoc()["username"];
$tokenStmt->close();


if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $conn->prepare("SELECT username, profile_photo, prof FROM users WHERE username = ?");
    $stmt->bind_param("s", $current_username);
    $stmt->execute();
    $userData = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    http_response_code(200);
    echo json_encode([
        "username" => $userData["username"],
        "profile_photo" => $userData["profile_photo"],
        "prof" => $userData["prof"] // Added to the JSON response
    ]);
    exit; 
}

function resizeAndSave($src, $dest, $maxDim = 400, $quality = 82) {
    $info = @getimagesize($src);
    if (!$info) return false;
    [$w, $h, $type] = $info;
    switch ($type) {
        case IMAGETYPE_JPEG: $img = imagecreatefromjpeg($src); break;
        case IMAGETYPE_PNG:  $img = imagecreatefrompng($src);  break;
        case IMAGETYPE_GIF:  $img = imagecreatefromgif($src);  break;
        case IMAGETYPE_WEBP: $img = imagecreatefromwebp($src); break;
        default: return false;
    }
    if (!$img) return false;
    $ratio = ($w > $maxDim || $h > $maxDim) ? min($maxDim / $w, $maxDim / $h) : 1;
    $nw = max(1, (int)($w * $ratio));
    $nh = max(1, (int)($h * $ratio));
    $out = imagecreatetruecolor($nw, $nh);
    imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
    $result = imagejpeg($out, $dest, $quality);
    imagedestroy($img);
    imagedestroy($out);
    return $result;
}

// ==========================================
// 2. PROCESS SETTINGS UPDATES
// ==========================================
$new_username = $_POST["new_username"] ?? null;
$new_password = $_POST["new_password"] ?? null;
$response_data = ["message" => "Settings updated successfully"];

// Start a transaction so if one update fails, they all roll back
$conn->begin_transaction();

try {
    // --- A. Handle Username Change ---
    if ($new_username && $new_username !== $current_username) {
        
        // Check if the new username is already taken
        $checkStmt = $conn->prepare("SELECT id FROM users WHERE username = ?");
        $checkStmt->bind_param("s", $new_username);
        $checkStmt->execute();
        if ($checkStmt->get_result()->num_rows > 0) {
            throw new Exception("Username already taken", 409);
        }
        $checkStmt->close();

        // Update all tables where username is referenced to prevent breaking listings
        $updateUsers = $conn->prepare("UPDATE users SET username = ? WHERE username = ?");
        $updateUsers->bind_param("ss", $new_username, $current_username);
        $updateUsers->execute();
        $updateUsers->close();

        $updateListings = $conn->prepare("UPDATE listings SET username = ? WHERE username = ?");
        $updateListings->bind_param("ss", $new_username, $current_username);
        $updateListings->execute();
        $updateListings->close();

        $updateSessions = $conn->prepare("UPDATE user_sessions SET username = ? WHERE username = ?");
        $updateSessions->bind_param("ss", $new_username, $current_username);
        $updateSessions->execute();
        $updateSessions->close();

        $response_data["new_username"] = $new_username;
        $current_username = $new_username; // Update reference for the rest of the script
    }

    // --- B. Handle Password Change ---
    if ($new_password) {
        $hashed = password_hash($new_password, PASSWORD_DEFAULT);
        $passStmt = $conn->prepare("UPDATE users SET password = ? WHERE username = ?");
        $passStmt->bind_param("ss", $hashed, $current_username);
        $passStmt->execute();
        $passStmt->close();
    }

    // --- C. Handle Profile Picture Upload ---
    if (isset($_FILES["profile_photo"]) && $_FILES["profile_photo"]["error"] === UPLOAD_ERR_OK) {
        $uploadDir = __DIR__ . "/../uploads/";
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $filename = "pfp_" . bin2hex(random_bytes(16)) . ".jpg";
        $destination = $uploadDir . $filename;

        if (resizeAndSave($_FILES["profile_photo"]["tmp_name"], $destination, 400, 82)) {
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
            $imagePath = $protocol . "://" . $_SERVER['HTTP_HOST'] . "/CSE442/2026-Spring/cse-442s/uploads/" . $filename;

            $picStmt = $conn->prepare("UPDATE users SET profile_photo = ? WHERE username = ?");
            $picStmt->bind_param("ss", $imagePath, $current_username);
            $picStmt->execute();
            $picStmt->close();
            
            $response_data["new_profile_photo"] = $imagePath;
        } else {
            throw new Exception("Failed to upload image", 500);
        }
    }

 // If everything succeeded, commit the changes to the database
    $conn->commit();

    // FIX: Force a fresh query to return the full user context to React
    $finalStmt = $conn->prepare("SELECT username, profile_photo, prof FROM users WHERE username = ?");
    $finalStmt->bind_param("s", $current_username);
    $finalStmt->execute();
    $finalData = $finalStmt->get_result()->fetch_assoc();
    $finalStmt->close();

    http_response_code(200);
    echo json_encode([
        "message" => "Settings updated successfully",
        "new_username" => $finalData["username"],
        "new_profile_photo" => $finalData["profile_photo"],
        "prof" => $finalData["prof"] // Guarantee it's in the payload
    ]);

} catch (Exception $e) {
    // If anything threw an error, undo all database changes in this transaction
    $conn->rollback();
    $code = $e->getCode() ?: 500;
    http_response_code($code);
    echo json_encode(["message" => $e->getMessage()]);
}

$conn->close();
?>