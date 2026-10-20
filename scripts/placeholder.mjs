// Stands in for the "dev" and "build" scripts until the Electron app exists (iteration 1).
const task = process.argv[2] ?? 'this command';
console.log(`Nothing to ${task} yet: the app itself is added in iteration 1.`);
