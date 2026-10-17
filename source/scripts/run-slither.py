"""Run the unmodified Slither detectors against a solc-js build-info adapter; no code upload."""
import inspect,json,os,sys
from pathlib import Path
from crytic_compile import CryticCompile
from crytic_compile.platform.hardhat import Hardhat
from slither.slither import Slither
from slither.detectors import all_detectors
from slither.detectors.abstract_detector import AbstractDetector
import importlib.metadata
project=Path(sys.argv[1]).resolve()
destination=Path(sys.argv[2]).resolve()
# Only substitute local artifact discovery; all detector implementations and findings remain unchanged.
Hardhat._get_hardhat_paths=lambda self,*args,**kwargs:{'root':project,'artifacts':project/'artifacts'}
os.chdir(project)
compilation=CryticCompile(Hardhat(str(project)),ignore_compile=True,npx_disable=True)
slither=Slither(compilation)
detectors=[item for _,item in inspect.getmembers(all_detectors,inspect.isclass) if issubclass(item,AbstractDetector) and item is not AbstractDetector]
for detector in sorted(set(detectors),key=lambda item:item.ARGUMENT):slither.register_detector(detector)
findings=[item for batch in slither.run_detectors() for item in batch]
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps({'success':True,'tool':'Slither','version':importlib.metadata.version('slither-analyzer'),'detectorCount':len(set(detectors)),'sourceHashes':json.loads((project/'source-hashes.json').read_text()),'results':{'detectors':findings}},ensure_ascii=False,indent=2),encoding='utf8')
print('Completed Slither: '+str(len(set(detectors)))+' detectors, '+str(len(findings))+' findings. Raw results retained.')
