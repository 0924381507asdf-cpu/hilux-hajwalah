import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// عدّل هذه القيمة إذا كانت مقدمة السيارة لا تطابق اتجاه الحركة:
// 0 | Math.PI / 2 | -Math.PI / 2 | Math.PI
const MODEL_Y_OFFSET = 0;

// 1. إعداد المشهد والإضاءة الاحترافية
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e293b);
scene.fog = new THREE.FogExp2(0x1e293b, 0.0022);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

// إضاءة متوازنة لإبراز تفاصيل الهيكل والخطوط الجانبية
const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x334155, 1.5);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfffbeb, 2.4);
dirLight.position.set(40, 80, 40);
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
rimLight.position.set(-40, 30, -50);
scene.add(rimLight);

// 2. مضمار الهجولة: أسفلت + أرصفة + حواجز + محيط
const roadWidth = 44;
const roadLength = 2400;

const roadGeo = new THREE.PlaneGeometry(roadWidth, roadLength);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7, metalness: 0.1 });
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
scene.add(road);

// حواف الطريق وأرصفة جانبية
const curbGeo = new THREE.BoxGeometry(1.2, 0.35, roadLength);
const curbMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 });

const leftCurb = new THREE.Mesh(curbGeo, curbMat);
leftCurb.position.set(-roadWidth / 2, 0.175, 0);
scene.add(leftCurb);

const rightCurb = new THREE.Mesh(curbGeo, curbMat);
rightCurb.position.set(roadWidth / 2, 0.175, 0);
scene.add(rightCurb);

// خطوط المنتصف المتقطعة
const dashGeo = new THREE.PlaneGeometry(0.45, 6);
const dashMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
for (let z = -roadLength / 2; z < roadLength / 2; z += 14) {
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.02, z);
    scene.add(dash);
}

// أرضية محيطة داكنة متناسقة مع الأفق
const groundGeo = new THREE.PlaneGeometry(2400, 2400);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.95 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);

// 3. تحميل مجسم الهايلكس الأصلي وضبط اتجاهه وأبعاده
const carContainer = new THREE.Group();
scene.add(carContainer);

const modelPivot = new THREE.Group();
carContainer.add(modelPivot);

const loader = new GLTFLoader();

loader.load('hilux.glb', (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
        if (child.isMesh) {
            child.frustumCulled = true;
            if (child.material) {
                child.material.precision = 'mediump';
            }
        }
    });

    // تصغير المجسم لحجم واقعي وتوسيطه
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 4.8 / maxDim;
    model.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(model);
    const center = scaledBox.getCenter(new THREE.Vector3());
    model.position.x = -center.x;
    model.position.z = -center.z;
    model.position.y = -scaledBox.min.y;

    modelPivot.rotation.y = MODEL_Y_OFFSET;
    modelPivot.add(model);

    document.getElementById('loading').style.display = 'none';
}, (xhr) => {
    if (xhr.total > 0) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        document.getElementById('progress').innerText = percent + '%';
    } else {
        const mbLoaded = (xhr.loaded / (1024 * 1024)).toFixed(1);
        document.getElementById('progress').innerText = mbLoaded + ' MB';
    }
}, (error) => {
    document.getElementById('loading').innerText = 'تعذر تحميل ملف hilux.glb';
    console.error(error);
});

// 4. التحكم والفيزياء (دوران 360 درجة مستمر + هجولة)
const keys = { gas: false, brake: false, left: false, right: false, handbrake: false };

const bindBtn = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; }, { passive: false });
    el.addEventListener('touchcancel', () => { keys[key] = false; });
    el.addEventListener('mousedown', () => keys[key] = true);
    el.addEventListener('mouseup', () => keys[key] = false);
    el.addEventListener('mouseleave', () => keys[key] = false);
};

bindBtn('btn-gas', 'gas');
bindBtn('btn-brake', 'brake');
bindBtn('btn-left', 'left');
bindBtn('btn-right', 'right');
bindBtn('btn-handbrake', 'handbrake');

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.gas = true;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.brake = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === ' ') keys.handbrake = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.gas = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.brake = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === ' ') keys.handbrake = false;
});

let velocity = new THREE.Vector3();
let carHeading = 0; // زاوية حرة غير محدودة تسمح بالدوران 360 درجة وأكثر
let driftScore = 0;
let camMode = 0;

document.getElementById('cam-btn').addEventListener('click', () => {
    camMode = (camMode + 1) % 2;
});

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    // محور الحركة الأمامي والجانبي بناءً على زاوية السيارة الحالية
    const forwardDir = new THREE.Vector3(Math.sin(carHeading), 0, Math.cos(carHeading));
    const rightDir = new THREE.Vector3(Math.cos(carHeading), 0, -Math.sin(carHeading));

    // التسارع والرجوع للخلف
    if (keys.gas) velocity.addScaledVector(forwardDir, 44 * dt);
    if (keys.brake) velocity.addScaledVector(forwardDir, -30 * dt);

    const speed = velocity.length();
    const steerInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);

    // دوران 360 درجة سلس سواء أثناء الحركة أو التفحيط والجلنط
    if (steerInput !== 0) {
        const moveFactor = speed > 0.5 ? Math.min(1, speed / 4 + 0.35) : 0.6;
        const turnSpeed = keys.handbrake ? 3.8 : 2.5;
        carHeading += steerInput * turnSpeed * moveFactor * dt;
    }

    // تفكيك السرعة إلى أمامية وجانبية للتحكم بالانجراف
    const forwardSpeed = velocity.dot(forwardDir);
    const lateralSpeed = velocity.dot(rightDir);

    const grip = keys.handbrake ? 1.4 : 4.2;
    const newLateralSpeed = THREE.MathUtils.lerp(lateralSpeed, 0, grip * dt);

    velocity.copy(forwardDir).multiplyScalar(forwardSpeed * 0.992)
            .addScaledVector(rightDir, newLateralSpeed);

    carContainer.position.addScaledVector(velocity, dt);
    carContainer.rotation.y = carHeading;

    // ميلان الهيكل مع الانجراف
    modelPivot.rotation.z = THREE.MathUtils.lerp(
        modelPivot.rotation.z,
        -lateralSpeed * 0.015,
        10 * dt
    );

    // نقاط الهجولة
    const driftAngle = Math.abs(lateralSpeed);
    if (driftAngle > 3.0 && speed > 6) {
        driftScore += Math.round(driftAngle * 2);
        document.getElementById('drift-score').innerText = driftScore;
    }

    document.getElementById('speed').innerText = Math.round(speed * 3.6);

    // الكاميرا
    if (camMode === 0) {
        const idealOffset = new THREE.Vector3(0, 2.8, -8).applyAxisAngle(new THREE.Vector3(0, 1, 0), carHeading);
        const idealPos = carContainer.position.clone().add(idealOffset);
        camera.position.lerp(idealPos, 7 * dt);
        camera.lookAt(carContainer.position.clone().add(new THREE.Vector3(0, 1.3, 0)));
    } else {
        const hoodOffset = new THREE.Vector3(0, 1.7, 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), carHeading);
        camera.position.copy(carContainer.position).add(hoodOffset);
        const lookTarget = carContainer.position.clone().add(forwardDir.clone().multiplyScalar(15));
        camera.lookAt(lookTarget);
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
