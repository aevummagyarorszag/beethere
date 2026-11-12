import os,subprocess,tempfile,unittest
from pathlib import Path

class UpdateWorkflowRaceTest(unittest.TestCase):
 def test_rebase_publishes_generated_data_and_preserves_concurrent_changes(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);remote=root/'remote.git';editor=root/'editor';worker=root/'worker'
   env={**os.environ,'GIT_AUTHOR_NAME':'Test','GIT_AUTHOR_EMAIL':'test@example.com','GIT_COMMITTER_NAME':'Test','GIT_COMMITTER_EMAIL':'test@example.com'}
   def git(where,*args,check=True):
    return subprocess.run(['git','-C',str(where),*args],env=env,check=check,capture_output=True,text=True)
   subprocess.run(['git','init','--bare','--initial-branch=main',str(remote)],check=True,capture_output=True)
   subprocess.run(['git','clone',str(remote),str(editor)],check=True,capture_output=True)
   (editor/'events.json').write_text('["old"]');(editor/'style.css').write_text('old design')
   git(editor,'add','.');git(editor,'commit','-m','seed');git(editor,'push','origin','main')
   subprocess.run(['git','clone',str(remote),str(worker)],check=True,capture_output=True)
   (editor/'events.json').write_text('["concurrent data"]');(editor/'style.css').write_text('new design')
   git(editor,'add','.');git(editor,'commit','-m','concurrent change');git(editor,'push','origin','main')
   (worker/'events.json').write_text('["fresh sheet data"]');git(worker,'add','events.json');git(worker,'commit','-m','update')
   self.assertNotEqual(git(worker,'push','origin','HEAD:main',check=False).returncode,0)
   git(worker,'fetch','origin','main');git(worker,'rebase','-X','theirs','origin/main');git(worker,'push','origin','HEAD:main')
   self.assertEqual((worker/'style.css').read_text(),'new design')
   self.assertEqual((worker/'events.json').read_text(),'["fresh sheet data"]')
   self.assertEqual(git(worker,'diff','--cached','--quiet').returncode,0)

if __name__=='__main__':unittest.main()
