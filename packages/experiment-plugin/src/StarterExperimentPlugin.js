import {
  EXPERIMENT_DEFINITION_VERSION
} from "../../experiment-runtime/src/index.js";
import {
  MODULE_MANIFEST_VERSION
} from "../../plugin-api/src/ModuleRegistry.js";

export const starterExperimentDefinitions = Object.freeze([
  Object.freeze({
    apiVersion: EXPERIMENT_DEFINITION_VERSION,
    id: "math.helix",
    title: "Hélice espacial",
    description: "Amostra uma curva helicoidal com caixas ou esferas.",
    tags: ["matemática", "curva", "3d"],
    parameters: [
      numberParameter("radius", "Raio", 3, 0.5, 12, 0.1),
      numberParameter("height", "Altura", 8, 0.5, 30, 0.1),
      numberParameter("turns", "Voltas", 3, 0.25, 12, 0.25),
      integerParameter("count", "Amostras", 96, 8, 500),
      numberParameter(
        "pointRadius",
        "Tamanho dos pontos",
        0.14,
        0.04,
        0.6,
        0.01
      ),
      colorParameter("color", "Cor", "#5b8bd9"),
      selectParameter("shape", "Forma", "sphere", [
        { value: "sphere", label: "Esfera" },
        { value: "box", label: "Caixa" }
      ])
    ],
    program: {
      mode: "expression",
      source: `({radius,height,turns,count,pointRadius,color,shape}) => {
  const created=[];
  for(let i=0;i<count;i+=1){
    const u=count===1?0:i/(count-1);
    const angle=turns*tau*u;
    const common={
      name:"Hélice "+(i+1),
      position:[radius*cos(angle),height*(u-0.5),radius*sin(angle)],
      color
    };
    created.push(shape==="sphere"
      ? spatial.create("sphere",{...common,radius:pointRadius})
      : spatial.create("box",{
          ...common,
          size:[pointRadius*2,pointRadius*2,pointRadius*2]
        }));
  }
  return {experiment:"math.helix",count:created.length,created};
}`
    }
  }),
  Object.freeze({
    apiVersion: EXPERIMENT_DEFINITION_VERSION,
    id: "math.sine-wave",
    title: "Onda senoidal",
    description: "Plota uma senoide e, opcionalmente, sua reflexão.",
    tags: ["matemática", "gráfico", "2d"],
    parameters: [
      numberParameter("amplitude", "Amplitude", 2, 0.1, 10, 0.1),
      numberParameter("length", "Comprimento", 12, 1, 40, 0.5),
      numberParameter("cycles", "Ciclos", 2, 0.25, 10, 0.25),
      integerParameter("count", "Amostras", 121, 8, 500),
      numberParameter(
        "pointRadius",
        "Raio dos pontos",
        0.11,
        0.03,
        0.5,
        0.01
      ),
      colorParameter("color", "Cor", "#d48676"),
      booleanParameter("mirror", "Refletir onda", false)
    ],
    program: {
      mode: "expression",
      source: `({amplitude,length,cycles,count,pointRadius,color,mirror}) => {
  const created=[];
  const add=(x,y,index,suffix="")=>created.push(spatial.create("sphere",{
    name:"Senoide "+(index+1)+suffix,
    radius:pointRadius,
    position:[x,y,0],
    color
  }));
  for(let i=0;i<count;i+=1){
    const u=count===1?0:i/(count-1);
    const x=length*(u-0.5);
    const y=amplitude*sin(cycles*tau*u);
    add(x,y,i);
    if(mirror&&abs(y)>1e-9)add(x,-y,i," refletida");
  }
  return {experiment:"math.sine-wave",count:created.length,created};
}`
    }
  }),
  Object.freeze({
    apiVersion: EXPERIMENT_DEFINITION_VERSION,
    id: "math.polar-flower",
    title: "Flor polar",
    description: "Desenha uma rosácea pela equação polar modulada.",
    tags: ["matemática", "polar", "arte"],
    parameters: [
      integerParameter("petals", "Pétalas", 7, 2, 24),
      numberParameter("radius", "Raio", 5, 0.5, 15, 0.1),
      integerParameter("count", "Amostras", 240, 24, 800),
      numberParameter(
        "pointRadius",
        "Raio dos pontos",
        0.1,
        0.03,
        0.5,
        0.01
      ),
      colorParameter("color", "Cor", "#72b883")
    ],
    program: {
      mode: "expression",
      source: `({petals,radius,count,pointRadius,color}) => {
  const created=[];
  for(let i=0;i<count;i+=1){
    const angle=tau*i/count;
    const distance=radius*(0.55+0.45*cos(petals*angle));
    created.push(spatial.create("sphere",{
      name:"Flor polar "+(i+1),
      radius:pointRadius,
      position:[distance*cos(angle),0,distance*sin(angle)],
      color
    }));
  }
  return {experiment:"math.polar-flower",count:created.length,created};
}`
    }
  })
]);

export const starterExperimentPlugin = Object.freeze({
  manifest: Object.freeze({
    manifestVersion: MODULE_MANIFEST_VERSION,
    id: "experiments.starter",
    version: "0.1.0",
    apiVersion: "experiment-plugin-v1",
    optional: true,
    capabilities: Object.freeze(["experiments"])
  }),

  activate({ experiments }) {
    for (const definition of starterExperimentDefinitions) {
      experiments.register(definition);
    }
    return Object.freeze({
      registered: starterExperimentDefinitions.length
    });
  }
});

function numberParameter(id, label, value, min, max, step) {
  return Object.freeze({
    id,
    label,
    type: "number",
    control: "slider",
    min,
    max,
    step,
    default: value
  });
}

function integerParameter(id, label, value, min, max) {
  return Object.freeze({
    id,
    label,
    type: "integer",
    control: "slider",
    min,
    max,
    step: 1,
    default: value
  });
}

function colorParameter(id, label, value) {
  return Object.freeze({
    id,
    label,
    type: "color",
    control: "color",
    default: value
  });
}

function selectParameter(id, label, value, options) {
  return Object.freeze({
    id,
    label,
    type: "select",
    control: "select",
    options,
    default: value
  });
}

function booleanParameter(id, label, value) {
  return Object.freeze({
    id,
    label,
    type: "boolean",
    control: "toggle",
    default: value
  });
}
