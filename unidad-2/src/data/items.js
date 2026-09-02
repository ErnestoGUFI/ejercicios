import { slugify } from "../utils/slugify.js";

const data = [
  ["JavaScript", "Lenguaje", "Lenguaje para crear interactividad en la web.", "console.log('Hola, JavaScript');"],
  ["Python", "Lenguaje", "Lenguaje claro y versátil para automatización, backend y datos.", "print('Hola, Python')"],
  ["MySQL", "Base de datos", "Sistema relacional para guardar y consultar información.", "SELECT * FROM usuarios;"],
  ["Git", "Herramienta", "Control de versiones para trabajar con cambios en el código.", "git status"],
];

export const items = data.map(([name, category, description, example]) => ({
  id: slugify(name),
  name,
  category,
  description,
  example,
}));
