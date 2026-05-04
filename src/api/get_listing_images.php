<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db.php';

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["error" => "Database connection failed"]);
    exit;
}

// Read JSON body
$input = json_decode(file_get_contents("php://input"), true);
$listingId = $input["listing_id"] ?? null;

if (!$listingId) {
    echo json_encode([]);
    exit;
}

$stmt = $conn->prepare("SELECT image_path FROM listing_images WHERE listing_id = ?");
$stmt->bind_param("i", $listingId);
$stmt->execute();
$res = $stmt->get_result();

$images = [];
while ($row = $res->fetch_assoc()) {
    if (!empty($row["image_path"])) {
        $images[] = $row["image_path"];
    }
}

$stmt->close();
$conn->close();

echo json_encode($images);
?>
