const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const modules = ['crm', 'sales', 'procurement', 'inventory', 'manufacturing', 'quality', 'assets', 'service', 'logistics', 'analytics', 'implementation', 'finance', 'projects', 'master_data', 'reporting'];
const resources = [];
const sources = {};
for (const module of modules) {
  const relative = `src/modules/${module}/${module}.routes.ts`;
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  sources[relative] = crypto.createHash('sha256').update(source).digest('hex');
  const tree = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'use' &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const factory = node.arguments.find(arg => ts.isCallExpression(arg) && arg.expression.getText(tree) === 'createCrudRouter');
      if (factory && ts.isObjectLiteralExpression(factory.arguments[0])) {
        const props = new Map(factory.arguments[0].properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(tree), p.initializer]));
        const model = props.get('modelName');
        if (model && ts.isStringLiteral(model)) {
          const route = node.arguments[0].text;
          resources.push({ key: `${module}.${route.slice(1)}`, module: module.toUpperCase(), path: `/api/v1/${module.replaceAll('_', '-')}${route}/`, model: model.text,
            readOnly: props.get('readOnly')?.kind === ts.SyntaxKind.TrueKeyword,
            searchFields: props.get('searchFields') && ts.isArrayLiteralExpression(props.get('searchFields')) ? props.get('searchFields').elements.filter(ts.isStringLiteral).map(s => s.text) : [],
            source: relative });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
sources['prisma/schema.prisma'] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'prisma/schema.prisma'))).digest('hex');
const target = path.join(root, 'src/modules/marbot/resource-catalog.generated.json');
const output = JSON.stringify({ sources, resources }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) throw new Error('Marka resource catalogue stale: run node scripts/generate_marbot_catalog.js');
} else fs.writeFileSync(target, output);
console.log(`Marka catalogue: ${resources.length} canonical resources in ${modules.length} modules.`);

