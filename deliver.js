const cp = require('child_process');
// This script requires the 'request' node.js module.
// This section grabs required node modules not packaged with
// the Automation Host service prior to executing the script.
const req = async module => {
    try {
        require.resolve(module);
    } catch (e) {
        console.log(`=== could not resolve "${module}" ===\n=== installing... ===`);
        cp.execSync(`npm install ${module}`);
        await setImmediate(() => {});
        console.log(`=== "${module}" has been installed ===`);
    }
    console.log(`=== requiring "${module}" ===`);
    try {
        return require(module);
    } catch (e) {
        console.log(`=== could not include "${module}" ===`);
        console.log(e);
        process.exit(1);
    }
}

const main = async () => {
    const { execSync } = await req("child_process");
    const fs = await req('fs');
    const path = await req('path');
    const request = await req('request');
    const util = require('util');

    const readDirAsync = util.promisify(fs.readdir);
    const readFileAsync = util.promisify(fs.readFile);
    const statAsync = util.promisify(fs.stat);

    const pulseUri = 'https://pulse-us-east-1.qtestnet.com/webhook/0570ab32-efd8-4995-ae9a-3cdd49e6c6fb'; // Pulse parser webhook endpoint
    const projectId = '74528'; // target qTest Project ID
    const cycleId = '5714304'; // target qTest Test Cycle ID

    var result = '';

    // edit these to reflect your results file and Extent HTML attachment path, escape the slashes as seen below
    let resultsPath = 'C:\\repo\\- Customer Specific -\\DHL\\results\\Result.xml';
    let attachmentsPath = 'C:\\repo\\- Customer Specific -\\DHL\\reports';

    let attachments = [];

    async function readDirChronoSorted(dirpath, order) {
        order = order || 1;
        const files = await readDirAsync(dirpath);
        const stats = await Promise.all(
            files.map((filename) =>
                statAsync(path.join(dirpath, filename))
            .then((stat) => ({ filename, stat }))
            )
        );
        return stats.sort((a, b) =>
            order * (b.stat.mtime.getTime() - a.stat.mtime.getTime())
        ).map((stat) => stat.filename);
    }

    // Build command line for test execution.  Place any scripts surrounding build/test procedures here.
    // Comment out this section if build/test execution takes place elsewhere.
    /*
    let command = '';
    
    console.log(`=== executing command ===`);
    console.log(command);
    execSync(command, {stdio: "inherit"});
    console.log(`=== command completed ===`);
    */
    // Build section end.

    try {
        if (fs.existsSync(attachmentsPath)) {
            console.log('=== read attachments path successfully ===');
            var files = await readDirChronoSorted(attachmentsPath);
            for (f = 0; f < files.length; f++) {
                var filename = files[f];
                if (filename.indexOf('.pdf') >= 0) {
                    await readFileAsync(attachmentsPath + '\\' + files[f], null, async function (err, data) {
                        attachment = data;
                        // base64 encode the contents of the results file
                        let buff = new Buffer.from(attachment);
                        let base64data = buff.toString('base64');
                        var encodedAttachment = {
                            'name': filename,
                            'data': base64data
                        }
                        attachments.push(encodedAttachment);
                        console.log('=== read attachment file ' + attachmentsPath + '\\' + filename + ' successfully ===');

                        let opts;

                        await readFileAsync(resultsPath, 'ascii', async function (err, data) {
                            console.log('=== read results file ' + resultsPath + ' successfully ===');
                            // base64 encode the results file
                            let buff = await new Buffer.from(data);
                            let base64data = await buff.toString('base64');

                            opts = {
                                url: pulseUri,
                                json: true,
                                body: {
                                    'projectId': projectId,
                                    'testcycle': cycleId,
                                    'result': base64data,
                                    'attachments': attachments
                                }
                            };
                            // perform the post
                            console.log('=== uploading results... ===')
                            await request.post(opts, async function(err, response, resbody) {
                                if (err) {
                                    Promise.reject(err);
                                } else {
                                    //console.log(response);
                                    //console.log(resbody);
                                    console.log('=== uploading results successfully ===')
                                    Promise.resolve("Uploaded results successfully.");
                                }
                            });                            
                        });
                    });
                }
            }
        }
    } catch (err) {
        console.log('=== error: ', err.stack, ' ===');
    }
};

main();