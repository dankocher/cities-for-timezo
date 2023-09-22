
First create directory ```/src/altNames```

https://download.geonames.org/export/dump/

download cities15000 and unzip to ```src/cities.txt```
https://download.geonames.org/export/dump/cities15000.zip

download file http://download.geonames.org/export/dump/alternateNamesV2.zip

unzip it to ```src/altNames/alternateNamesV2.txt```

then 

```split -l 500000 -d --additional-suffix=.txt alternateNamesV2.txt altNames_```

* -l 5000: split file into files of 5,000 lines each.
* -d: numerical suffix. This will make the suffix go from 00 to 99 by default instead of aa to zz.
* --additional-suffix: lets you specify the suffix, here the extension
* $FileName: name of the file to be split.
* file: prefix to add to the resulting files.

As always, check out man split for more details.

For Mac, the default version of split is dumbed down. You can install the GNU version using the following command. (see this question for more GNU utils)

```brew install coreutils```

and then you can execute the above command by replacing split with gsplit. Check out man gsplit for details.


out of memory error

--max-old-space-size=16384

https://www.makeuseof.com/javascript-heap-out-of-memory-error-fix/
