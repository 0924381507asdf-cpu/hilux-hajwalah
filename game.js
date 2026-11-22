import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 1. إعداد المشهد والإضاءة مع تحسين الأداء للملفات الكبيرة
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9a066);
scene.fog = new THREE.FogExp2(0xd9a066, 0.0025);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
const renderer = new THREE.WebGLRenderer({ 
    antialias: false, // إيقاف تنعيم الحواف لتخفيف الحمل على معالج الهاتف مع المجسمات الثقيلة
    powerPreference: "high-performance" 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // ضبط الدقة لضمان سلاسة الإطارات
document.body.appendChild(renderer.domElement);

// إضاءة الشمس والسماء
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d6e63, 1.4);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff3e0, 2);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// 2. أرضية الأسفلت + الصحراء المحيطة
const roadGeo = new THREE.PlaneGeometry(40, 2000);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85 });
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
scene.add(road);

const lineGeo = new THREE.PlaneGeometry(0.5, 2000);
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const centerLine = new THREE.Mesh(lineGeo, lineMat);
centerLine.rotation.x = -Math.PI / 2;
centerLine.position.y = 0.02;
scene.add(centerLine);

const desertGeo = new THREE.PlaneGeometry(2000, 2000);
const desertMat = new THREE.MeshStandardMaterial({ color: 0xc29b61, roughness: 1 });
const desert = new THREE.Mesh(desertGeo, desertMat);
desert.rotation.x = -Math.PI / 2;
desert.position.y = -0.05;
scene.add(desert);

// 3. تحميل مجسم الهايلكس الأصلي مباشرة بدون ضغط
const carContainer = new THREE.Group();
scene.add(carContainer);

const loader = new GLTFLoader();

// تأكد أن اسم الملف المرفوع في GitHub مطابق للاسم هنا (hilux.glb)
loader.load('hilux.glb', (gltf) => {
    const model = gltf.scene;
    
    // تحسين المواد لتسريع العرض دون فقدان التفاصيل
    model.traverse((child) => {
        if (child.isMesh) {
            child.frustumCulled = true;
            if (child.material) {
                child.material.precision = 'mediump';
            }
        }
    });

    // حساب أبعاد المجسم وتصغيره لحجم واقعي
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 4.8 / maxDim;
    model.scale.setScalar(scale);

    // توسيط السيارة فوق الأرض مباشرة
    const scaledBox = new THREE.Box3().setFromObject(model);
    const center = scaledBox.getCenter(new THREE.Vector3());
    model.position.x = -center.x;
    model.position.z = -center.z;
    model.position.y = -scaledBox.min.y;

    carContainer.add(model);
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
    document.getElementById('loading').innerText = 'تأكد من وجود ملف hilux.glb في نفس المجلد';
    console.error(error);
});

// 4. نظام التحكم والفيزياء (هجولة وانزلاق جانبي)
const keys = { gas: false, brake: false, left: false, right: false, handbrake: false };

const bindBtn = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
    el.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    el.addEventListener('mousedown', () => keys[key] = true);
    el.addEventListener('mouseup', () => keys[key] = false);
};

bindBtn('btn-gas', 'gas');
bindBtn('btn-brake', 'brake');
bindBtn('btn-left', 'left');
bindBtn('btn-right', 'right');
bindBtn('btn-handbrake', 'handbrake');

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') keys.gas = true;
    if (e.key === 'ArrowDown' || e.key === 's') keys.brake = true;
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
    if (e.key === ' ') keys.handbrake = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') keys.gas = false;
    if (e.key === 'ArrowDown' || e.key === 's') keys.brake = false;
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
    if (e.key === ' ') keys.handbrake = false;
});

let velocity = new THREE.Vector3();
let carHeading = 0;
let angularVelocity = 0;
let driftScore = 0;
let camMode = 0;

document.getElementById('cam-btn').addEventListener('click', () => {
    camMode = (camMode + 1) % 2;
});

// 5. حلقة التحديث الرئيسية
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    const forwardDir = new THREE.Vector3(Math.sin(carHeading), 0, Math.cos(carHeading));
    const rightDir = new THREE.Vector3(Math.cos(carHeading), 0, -Math.sin(carHeading));

    if (keys.gas) velocity.addScaledVector(forwardDir, 38 * dt);
    if (keys.brake) velocity.addScaledVector(forwardDir, -25 * dt);

    const speed = velocity.length();
    const steerInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    
    if (speed > 1) {
        const turnFactor = keys.handbrake ? 3.2 : 2.1;
        angularVelocity = THREE.MathUtils.lerp(angularVelocity, steerInput * turnFactor, 8 * dt);
        carHeading += angularVelocity * dt * (speed > 5 ? 1 : speed / 5);
    }

    const forwardSpeed = velocity.dot(forwardDir);
    const lateralSpeed = velocity.dot(rightDir);

    const grip = keys.handbrake ? 1.2 : 4.5;
    const newLateralSpeed = THREE.MathUtils.lerp(lateralSpeed, 0, grip * dt);

    velocity.copy(forwardDir).multiplyScalar(forwardSpeed * 0.992)
            .addScaledVector(rightDir, newLateralSpeed);

    carContainer.position.addScaledVector(velocity, dt);
    carContainer.rotation.y = carHeading;

    if (carContainer.children[0]) {
        carContainer.children[0].rotation.z = THREE.MathUtils.lerp(
            carContainer.children[0].rotation.z,
            -lateralSpeed * 0.015,
            10 * dt
        );
    }

    const driftAngle = Math.abs(lateralSpeed);
    if (driftAngle > 3.5 && speed > 8) {
        driftScore += Math.round(driftAngle * 2);
        document.getElementById('drift-score').innerText = driftScore;
    }

    document.getElementById('speed').innerText = Math.round(speed * 3.6);

    if (camMode === 0) {
        const idealOffset = new THREE.Vector3(0, 2.6, -7.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), carHeading);
        const idealPos = carContainer.position.clone().add(idealOffset);
        camera.position.lerp(idealPos, 8 * dt);
        camera.lookAt(carContainer.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
    } else {
        const hoodOffset = new THREE.Vector3(0, 1.6, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), carHeading);
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
