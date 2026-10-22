import importlib.util
import io
from pathlib import Path
import unittest
import tempfile
import json
from unittest.mock import patch, MagicMock
import subprocess

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).with_name('receive.py'))
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)

class CommandBoundary(unittest.TestCase):
    def test_accepts_only_exact_full_sha(self):
        self.assertEqual(receiver.requested_sha('deploy ' + 'a' * 40), 'a' * 40)
        for command in ['', 'bash', 'deploy main', 'deploy ' + 'a' * 39, 'deploy ' + 'a' * 40 + '; id', 'deploy ' + 'a' * 40 + '\n', 'deploy ' + 'A' * 40]:
            with self.subTest(command=command), self.assertRaises(ValueError):
                receiver.requested_sha(command)

    def test_token_transport_accepts_opaque_formats_without_control_characters(self):
        for token in ['synthetic.token+/=_-:value', 'x' * 8192]:
            self.assertEqual(receiver.read_token(io.StringIO(token + '\n')), token)
        for token in ['', 'x' * 8193, 'contains space', 'tab\tvalue', 'nul\x00value', 'carriage\rvalue']:
            with self.subTest(length=len(token)), self.assertRaises(ValueError):
                receiver.read_token(io.StringIO(token + '\n'))

    def test_topology_schema_and_fixture_changes_need_operator_review(self):
        for path in ['deploy/compose.sh', 'infra/gateway.mjs', 'compose.yaml',
                     'server/db.mjs', 'server/db.ts', 'src/store.ts', 'fixture/Dockerfile', 'vendor/identity.tgz']:
            with self.subTest(path=path):
                self.assertTrue(receiver.requires_operator_review([path]))
        self.assertFalse(receiver.requires_operator_review(['public/app.js', 'server/routes.mjs', 'fixture/README.md']))

class RollbackRecord(unittest.TestCase):
    def test_same_release_retry_keeps_distinct_previous_image(self):
        previous = {'sha': 'new', 'image': 'app:new', 'previous': 'app:old'}
        self.assertEqual(receiver.deployment_record('new', 'app:new', previous)['previous'], 'app:old')
        self.assertEqual(receiver.deployment_record('newer', 'app:newer', previous)['previous'], 'app:new')

class RuntimeBaseline(unittest.TestCase):
    def test_candidate_runtime_failure_is_propagated(self):
        failure = subprocess.CalledProcessError(1, ['docker', 'run'])
        with patch.object(receiver, 'run', side_effect=failure) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                receiver.require_patched_node('app:unpatched')
        args = run.call_args.args
        self.assertIn('--network', args)
        self.assertIn('none', args)
        self.assertIn('app:unpatched', args)


class SandboxRegistration(unittest.TestCase):
    def test_unknown_target_and_path_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(receiver.sandbox_target('new-app', Path(directory)))
            for name in ['../app', '/root', 'app;id', 'App', 'app\n']:
                with self.assertRaises(ValueError):
                    receiver.sandbox_target(name, Path(directory))

    def test_operator_registration_has_fixed_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'hello'
            target.mkdir()
            config = target / 'target.json'
            config.write_text(json.dumps({'branch': 'main', 'port': 3210}))
            self.assertEqual(receiver.sandbox_target('hello', Path(directory)), {'branch': 'main', 'port': 3210})
            for value in [{'branch': 'main', 'port': 22}, {'branch': '--upload-pack=sh', 'port': 3210}, {'branch': '--force', 'port': 3210},
                          {'branch': 'main', 'port': True}, {'branch': 'main', 'port': 3210, 'command': 'sh'}]:
                config.write_text(json.dumps(value))
                with self.assertRaises(ValueError):
                    receiver.sandbox_target('hello', Path(directory))

    def test_failed_candidate_restores_previous_image_and_keeps_record(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / 'hello'
            root.mkdir()
            previous = {'sha': 'a' * 40, 'image': 'app:previous'}
            (root / 'current.json').write_text(json.dumps(previous))
            calls = []
            def run(*args, **kwargs):
                calls.append(args)
                if 'up' in args and json.loads((root / 'image.json').read_text())['services']['app']['image'] != 'app:previous':
                    raise subprocess.CalledProcessError(1, args)
            with patch.object(receiver, 'BASE', base), \
                 patch.object(receiver.sys, 'argv', ['receive.py', 'hello']), \
                 patch.object(receiver.sys, 'stdin', io.StringIO('synthetic-test-token\n')), \
                 patch.dict(receiver.os.environ, {'SSH_ORIGINAL_COMMAND': 'deploy ' + 'b' * 40}), \
                 patch.object(receiver, 'sandbox_target', return_value={'branch': 'main', 'port': 3210}), \
                 patch.object(receiver, 'capture', side_effect=['b' * 40, 'src/main.tsx']), \
                 patch.object(receiver.tarfile, 'open', return_value=MagicMock()), \
                 patch.object(receiver, 'run', side_effect=run):
                with self.assertRaises(subprocess.CalledProcessError):
                    receiver.main()
            self.assertEqual(json.loads((root / 'image.json').read_text())['services']['app']['image'], 'app:previous')
            self.assertEqual(json.loads((root / 'current.json').read_text()), previous)
            self.assertEqual(len([call for call in calls if 'up' in call]), 2)
            self.assertTrue(all('--no-deps' in call for call in calls if 'up' in call))

if __name__ == '__main__':
    unittest.main()
