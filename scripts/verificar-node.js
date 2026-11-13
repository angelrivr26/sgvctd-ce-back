const [major, minor] = process.versions.node.split('.').map(Number);

if (major !== 20 || minor < 12) {
  console.error(
    `Node.js ${process.versions.node} no es compatible. Use Node.js >=20.12 y <21 antes de ejecutar npm install.`,
  );
  process.exit(1);
}

console.log(`Runtime compatible: Node.js ${process.versions.node}.`);
