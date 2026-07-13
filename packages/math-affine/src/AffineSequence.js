import {
  identityMatrix, multiplyMatrices, translationMatrix, scaleMatrix,
  eulerQuaternion, composeTransform, decomposeTransform, aroundPivot,
  validateMatrix
} from "./Matrix4.js";

export function composeAffineOperations(operations=[]) {
  let pivot=[0,0,0], result=identityMatrix();
  for (const operation of operations) {
    const type=String(operation?.type??"").toLowerCase();
    if (type==="pivot") { pivot=vec(operation.value,type); continue; }
    let matrix;
    if (type==="move") matrix=translationMatrix(vec(operation.value,type));
    else if (type==="rotate") matrix=aroundPivot(composeTransform({rotation:eulerQuaternion(vec(operation.value,type))}),pivot);
    else if (type==="scale") matrix=aroundPivot(scaleMatrix(vec(operation.value,type)),pivot);
    else if (type==="matrix") matrix=[...validateMatrix(operation.value)];
    else throw new Error(`Operação afim desconhecida: ${type}.`);
    result=multiplyMatrices(matrix,result);
  }
  return result;
}

export function affineCopies(object,count,stepMatrix) {
  const n=Number(count);
  if (!Number.isInteger(n)||n<1) throw new RangeError("count deve ser inteiro positivo.");
  validateMatrix(stepMatrix);
  const source=composeTransform(object);
  let accumulated=identityMatrix();
  const result=[];
  for (let index=1; index<=n; index+=1) {
    accumulated=multiplyMatrices(stepMatrix,accumulated);
    result.push({index,...decomposeTransform(multiplyMatrices(accumulated,source))});
  }
  return result;
}

function vec(v,name) {
  if (!Array.isArray(v)||v.length!==3) throw new Error(`${name} exige 3 valores.`);
  return v.map(x=>{
    const n=Number(x);
    if (!Number.isFinite(n)) throw new Error(`Valor inválido em ${name}: ${x}.`);
    return n;
  });
}
