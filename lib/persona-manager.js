const fs = require('fs');
const path = require('path');
const { getPersonaBaseDir } = require('./client-scanner');

function getPersonaDir(clientName, personaName) {
  return path.join(getPersonaBaseDir(clientName), personaName);
}

function getPersonaDefinition(clientName, personaName) {
  const filePath = path.join(getPersonaDir(clientName, personaName), '_persona.md');
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

function createPersona(clientName, personaName, definition) {
  const dir = getPersonaDir(clientName, personaName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, '_persona.md');
  fs.writeFileSync(filePath, definition, 'utf-8');
  return { name: personaName, definition };
}

function updatePersona(clientName, personaName, definition) {
  const filePath = path.join(getPersonaDir(clientName, personaName), '_persona.md');
  if (!fs.existsSync(filePath)) throw new Error('Persona not found');
  fs.writeFileSync(filePath, definition, 'utf-8');
  return { name: personaName, definition };
}

module.exports = { getPersonaDefinition, createPersona, updatePersona };
