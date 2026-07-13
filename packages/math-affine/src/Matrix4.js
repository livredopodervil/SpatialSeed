const EPS = 1e-12;

export const identityMatrix = () => [
  1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1
];

export function multiplyMatrices(a, b) {
  validateMatrix(a); validateMatrix(b);
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) {
        r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k];
      }
    }
  }
  return r;
}

export const translationMatrix = ([x,y,z]) => [
  1,0,0,0, 0,1,0,0, 0,0,1,0, num(x),num(y),num(z),1
];

export const scaleMatrix = ([x,y,z]) => [
  num(x),0,0,0, 0,num(y),0,0, 0,0,num(z),0, 0,0,0,1
];

export function eulerQuaternion([xd, yd, zd]) {
  const x = num(xd) * Math.PI / 360;
  const y = num(yd) * Math.PI / 360;
  const z = num(zd) * Math.PI / 360;
  const c1=Math.cos(x), c2=Math.cos(y), c3=Math.cos(z);
  const s1=Math.sin(x), s2=Math.sin(y), s3=Math.sin(z);
  return normalizeQuat([
    s1*c2*c3+c1*s2*s3,
    c1*s2*c3-s1*c2*s3,
    c1*c2*s3+s1*s2*c3,
    c1*c2*c3-s1*s2*s3
  ]);
}

export function quaternionMatrix(q) {
  const [x,y,z,w] = normalizeQuat(q);
  const x2=x+x, y2=y+y, z2=z+z;
  const xx=x*x2, xy=x*y2, xz=x*z2;
  const yy=y*y2, yz=y*z2, zz=z*z2;
  const wx=w*x2, wy=w*y2, wz=w*z2;
  return [
    1-(yy+zz), xy+wz, xz-wy, 0,
    xy-wz, 1-(xx+zz), yz+wx, 0,
    xz+wy, yz-wx, 1-(xx+yy), 0,
    0,0,0,1
  ];
}

export function composeTransform({
  position=[0,0,0], rotation=[0,0,0,1], scale=[1,1,1]
}={}) {
  return multiplyMatrices(
    translationMatrix(position),
    multiplyMatrices(quaternionMatrix(rotation), scaleMatrix(scale))
  );
}

export function aroundPivot(matrix, pivot) {
  return multiplyMatrices(
    translationMatrix(pivot),
    multiplyMatrices(matrix, translationMatrix(pivot.map(v => -num(v))))
  );
}

export function decomposeTransform(m) {
  validateMatrix(m);
  const position=[m[12],m[13],m[14]];
  let sx=Math.hypot(m[0],m[1],m[2]);
  const sy=Math.hypot(m[4],m[5],m[6]);
  const sz=Math.hypot(m[8],m[9],m[10]);
  const det =
    m[0]*(m[5]*m[10]-m[9]*m[6]) -
    m[4]*(m[1]*m[10]-m[9]*m[2]) +
    m[8]*(m[1]*m[6]-m[5]*m[2]);
  if (det < 0) sx = -sx;
  if (Math.abs(sx)<EPS || Math.abs(sy)<EPS || Math.abs(sz)<EPS) {
    throw new Error("Matriz não pode ser decomposta: escala nula.");
  }
  const r=[
    m[0]/sx,m[1]/sx,m[2]/sx,0,
    m[4]/sy,m[5]/sy,m[6]/sy,0,
    m[8]/sz,m[9]/sz,m[10]/sz,0,
    0,0,0,1
  ];
  return { position, rotation: quatFromMatrix(r), scale:[sx,sy,sz] };
}

export function validateMatrix(m) {
  if (!Array.isArray(m) || m.length !== 16) {
    throw new TypeError("Matriz deve conter 16 valores.");
  }
  m.forEach(num);
  return m;
}

function quatFromMatrix(m) {
  const m11=m[0],m12=m[4],m13=m[8],m21=m[1],m22=m[5],m23=m[9],m31=m[2],m32=m[6],m33=m[10];
  const trace=m11+m22+m33;
  let x,y,z,w,s;
  if (trace>0) {
    s=0.5/Math.sqrt(trace+1); w=0.25/s; x=(m32-m23)*s; y=(m13-m31)*s; z=(m21-m12)*s;
  } else if (m11>m22 && m11>m33) {
    s=2*Math.sqrt(1+m11-m22-m33); w=(m32-m23)/s; x=0.25*s; y=(m12+m21)/s; z=(m13+m31)/s;
  } else if (m22>m33) {
    s=2*Math.sqrt(1+m22-m11-m33); w=(m13-m31)/s; x=(m12+m21)/s; y=0.25*s; z=(m23+m32)/s;
  } else {
    s=2*Math.sqrt(1+m33-m11-m22); w=(m21-m12)/s; x=(m13+m31)/s; y=(m23+m32)/s; z=0.25*s;
  }
  return normalizeQuat([x,y,z,w]);
}

function normalizeQuat(q) {
  const a=q.map(num), l=Math.hypot(...a);
  return l<EPS ? [0,0,0,1] : a.map(v=>v/l);
}
function num(v) {
  const n=Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`Valor numérico inválido: ${v}.`);
  return n;
}
